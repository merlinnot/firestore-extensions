/* eslint-disable @typescript-eslint/method-signature-style */
/* eslint-disable immutable/no-mutation, immutable/no-this */
/* eslint-disable unicorn/prevent-abbreviations */

import { strict as assert } from 'assert';
import { EventEmitter, once } from 'events';
import type { CallOptions, CancellableStream } from 'google-gax';
import { equals } from 'ramda';

import {
  ExponentialBackoffManager,
  makeExponentialBackoffManager,
} from '../common/retries';
import { toId, toMilliseconds } from './converters';
import type {
  Client,
  Converter,
  DocumentAddedEventData,
  DocumentDeletedEventData,
  DocumentUpdatedEventData,
  google,
  QueryTarget,
  ToNativeDocument,
} from './types';

const CLOUD_RESOURCE_HEADER = 'google-cloud-resource-prefix';
const MAXIMUM_LISTENER_COUNT = 64_000;
const TARGET_ID = 1;

const events = new Set([
  'documentAdded',
  'documentUpdated',
  'documentDeleted',
  'error',
  'synchronized',
  'warning',
]);

declare interface Collection<
  NativeType extends ToNativeDocument<object>,
  TargetType,
> {
  emit(
    event: 'documentAdded',
    document: DocumentAddedEventData<TargetType>,
  ): boolean;
  emit(
    event: 'documentUpdated',
    document: DocumentUpdatedEventData<TargetType>,
  ): boolean;
  emit(event: 'documentDeleted', document: DocumentDeletedEventData): boolean;
  emit(event: 'error' | 'warning', error: Error): boolean;
  emit(event: 'synchronized'): boolean;
  /**
   * A `documentAdded` event is sent when a document is added to the cache.
   * The following updates to this document result in `documentUpdated`
   * events being sent.
   */
  on(
    event: 'documentAdded',
    listener: (document: DocumentAddedEventData<TargetType>) => void,
  ): this;
  /**
   * A `documentUpdated` event is sent when a document was already in the cache
   * and the updated value, after conversion, does not match the previous one.
   */
  on(
    event: 'documentUpdated',
    listener: (document: DocumentUpdatedEventData<TargetType>) => void,
  ): this;
  /**
   * A `documentDeleted` event is sent when a document was present in the cache,
   * but no longer matches the query.
   */
  on(
    event: 'documentDeleted',
    listener: (document: DocumentDeletedEventData) => void,
  ): this;
  /**
   * An `error` is emitted when the subscription cannot recover, it is
   * a terminal state. Retriable errors result in a `warning` event.
   */
  on(event: 'error' | 'warning', listener: (error: Error) => void): this;
  /**
   * A `synchronized` event is emitted when cached data is current.
   */
  on(event: 'synchronized', listener: () => void): this;
}

interface Counters {
  activeListeners: number;
  listen: {
    targetChanges: {
      [Key in google.firestore.v1.TargetChange.TargetChangeType]: number;
    };
    totalResponses: {
      [Key in NonNullable<
        google.firestore.v1.ListenResponse['responseType']
      >]: number;
    };
  };
  runQuery: {
    totalResponses: number;
  };
}

type UsageMetricType = 'changed' | 'filtered' | 'removed';

type UsageMetricsCounters = {
  [key in UsageMetricType]: number;
};

interface UsageMetrics {
  counters: UsageMetricsCounters;
  synchronizedDocumentIds: Set<string>;
}

/**
 * Collection provides an interface to observe changes in Firestore collections,
 * with support for pausing and resuming subscriptions.
 *
 * Pausing and resuming is handled automatically based on attached listeners. If
 * no listeners are active, the subscription is paused. If a listener is added,
 * the subscription is started.
 *
 * The implementation provides best-effort optimization of queries. For
 * instance:
 * - Subscriptions paused for longer than 30 minutes might incur costs as if
 *   the entire collection was read, although only changed documents will be
 *   transferred over the network.
 * - Only first synchronization of data utilizes provided field masks.
 */
class Collection<
  NativeType extends ToNativeDocument<object>,
  TargetType,
> extends EventEmitter {
  private readonly backoffManager: ExponentialBackoffManager =
    makeExponentialBackoffManager();

  private readonly client: Client;

  private readonly converter: Converter<NativeType, TargetType>;

  private readonly counters: Counters = {
    activeListeners: 0,
    listen: {
      targetChanges: {
        ADD: 0,
        CURRENT: 0,
        NO_CHANGE: 0,
        REMOVE: 0,
        RESET: 0,
      },
      totalResponses: {
        documentChange: 0,
        documentDelete: 0,
        documentRemove: 0,
        filter: 0,
        targetChange: 0,
      },
    },
    runQuery: {
      totalResponses: 0,
    },
  };

  private readonly emittedData: Map<string, TargetType> = new Map();

  /**
   * Indicates if the collection was initialized. Initialization happens once,
   * when a collection is subscribed to for the first time. Only then
   * projections (field masks) can be used to optimize the data fetch.
   */
  private initialized = false;

  private lastSynchronizationTime: google.protobuf.ITimestamp | undefined;

  private readonly projectId: string;

  private readonly queryTarget: google.firestore.v1.Target.IQueryTarget;

  private readTime: google.protobuf.ITimestamp | undefined;

  private resumeToken: Uint8Array | undefined;

  /**
   * Current stream.
   *
   * Set to `null` when a task to add a stream is pending and the stream is
   * deliberately not created (awaiting backoff).
   */
  private stream: CancellableStream | null | undefined;

  private synchronized: boolean = false;

  private readonly targetData: Map<string, TargetType> = new Map();

  private readonly usageMetrics: UsageMetrics = {
    counters: {
      changed: 0,
      filtered: 0,
      removed: 0,
    },
    synchronizedDocumentIds: new Set<string>(),
  };

  public constructor({
    client,
    converter,
    projectId,
    queryTarget,
  }: {
    client: Client;
    converter: Converter<NativeType, TargetType>;
    projectId: string;
    queryTarget: QueryTarget;
  }) {
    super();

    this.converter = converter;
    this.client = client;
    this.projectId = projectId;
    this.queryTarget = queryTarget;

    this.registerAutoPause();
    this.setMaxListeners(MAXIMUM_LISTENER_COUNT);
  }

  /**
   * Returns all data emitted by the subscription (current state of the world).
   */
  public data(): ReadonlyMap<string, TargetType> {
    return this.emittedData;
  }

  /**
   * Indicates if the subscription is active, therefore listening for updates.
   */
  public isActive(): boolean {
    return this.stream !== undefined;
  }

  /**
   * Indicates if all data has been synchronized (initial fetch).
   */
  public isSynchronized(): boolean {
    return this.synchronized;
  }

  /**
   * Returns the time when the subscription was synchronized [ms].
   */
  public lastSynchronized(): number | undefined {
    return this.lastSynchronizationTime === undefined
      ? undefined
      : toMilliseconds(
          this.lastSynchronizationTime as Parameters<typeof toMilliseconds>[0],
        );
  }

  /**
   * Returns current usage metrics information for the current collection
   * subscription. Resets after each call to the method.
   */
  public metrics(): UsageMetricsCounters {
    const currentMetrics: UsageMetricsCounters = {
      ...this.usageMetrics.counters,
    };

    this.usageMetrics.counters = {
      changed: 0,
      filtered: 0,
      removed: 0,
    };

    return currentMetrics;
  }

  /**
   * Resets the cached information used to resume subscriptions.
   *
   * Under normal conditions, this should never be used. However, in rare cases,
   * the new call might be made against a database which does not have a memory
   * of the previous session. This can happen, for example:
   * - When connecting to a database through a proxy, which changes the target
   *   between calls.
   * - When DNS resolution changes the target between calls.
   * - When Firestore Emulator data is actively cleared.
   *
   * The method can be called on active subscriptions, in which case the
   * behavior is undefined. This should generally be avoided.
   */
  public reset(): void {
    this.targetData.clear();
    this.emittedData.clear();

    this.synchronized = false;

    delete this.resumeToken;
    delete this.readTime;
  }

  /**
   * Returns statistical information for the current collection subscription.
   */
  public statistics(): Counters {
    return this.counters;
  }

  /**
   * Awaits initial data synchronization (cache fill).
   */
  public async synchronize(): Promise<void> {
    if (this.isSynchronized()) {
      return;
    }

    await once(this, 'synchronized');
  }

  private addTarget(): void {
    const { select, ...structuredQuery } =
      this.queryTarget.structuredQuery ?? {};
    const request: google.firestore.v1.IListenRequest = {
      addTarget: {
        query: { ...this.queryTarget, structuredQuery },
        readTime: this.readTime,
        resumeToken: this.resumeToken,
        targetId: TARGET_ID,
      },
      database: this.getDatabaseReference(),
    };

    this.stream?.write(request);
  }

  /**
   * Marks the collection as current (synchronized).
   */
  private current(): void {
    for (const id of this.emittedData.keys()) {
      if (this.targetData.has(id) === false) {
        this.emittedData.delete(id);

        this.emit('documentDeleted', { id });
      }
    }

    this.synchronized = true;
    this.lastSynchronizationTime = this.readTime;

    this.emit('synchronized');
  }

  private getCallOptions(): CallOptions {
    return {
      otherArgs: {
        headers: {
          [CLOUD_RESOURCE_HEADER]: this.getDatabaseReference(),
        },
      },
    };
  }

  private getDatabaseReference(): string {
    return `projects/${this.projectId}/databases/(default)`;
  }

  private onDocumentChange(
    data: NonNullable<google.firestore.v1.ListenResponse['documentChange']>,
  ): void {
    assert(data.document, 'Document change does not have a document.');
    assert(
      data.document.name,
      'Document change does not have a document name.',
    );

    // Convert data from native representation.
    const converted = this.converter(data.document as NativeType);

    if (converted === undefined) {
      this.onDocumentDelete({ document: data.document.name });
    } else {
      const id = toId(data.document.name);

      this.usageMetrics.synchronizedDocumentIds.add(id);
      this.usageMetrics.counters.changed++;

      // Get current status and update cache.
      const emitted = this.emittedData.get(id);
      this.targetData.set(id, converted);
      this.emittedData.set(id, converted);

      // Emit changes.
      if (emitted === undefined) {
        this.emit('documentAdded', { data: converted, id });
      } else if (equals(emitted, converted) === false) {
        this.emit('documentUpdated', { after: converted, before: emitted, id });
      }
    }
  }

  private onDocumentDelete(
    data: NonNullable<google.firestore.v1.ListenResponse['documentDelete']>,
  ): void {
    assert(data.document, 'Document change does not have a document.');

    const id = toId(data.document);

    this.usageMetrics.synchronizedDocumentIds.add(id);
    this.usageMetrics.counters.removed++;

    this.targetData.delete(id);

    if (this.emittedData.delete(id)) {
      this.emit('documentDeleted', { id });
    }
  }

  private onDocumentRemove(
    data: NonNullable<google.firestore.v1.ListenResponse['documentRemove']>,
  ): void {
    assert(data.document, 'Document change does not have a document.');

    const id = toId(data.document);

    this.usageMetrics.synchronizedDocumentIds.add(id);
    this.usageMetrics.counters.removed++;

    this.targetData.delete(id);

    if (this.emittedData.delete(id)) {
      this.emit('documentDeleted', { id });
    }
  }

  private onError(error: Error): void {
    this.emit('warning', error);

    this.restart();
  }

  private onFilter(
    filter: NonNullable<google.firestore.v1.ListenResponse['filter']>,
  ): void {
    const documentsCount = filter.count ?? 0;
    const changedDocumentsCount =
      this.usageMetrics.synchronizedDocumentIds.size;
    this.usageMetrics.counters.filtered +=
      documentsCount - changedDocumentsCount;
    this.usageMetrics.synchronizedDocumentIds.clear();

    /*
     * If the number of remote and local documents does not match, data needs
     * to be re-synchronized. Clear the internal data set and restart the
     * subscription.
     */
    if (filter.count !== this.targetData.size) {
      delete this.readTime;
      delete this.resumeToken;

      this.resetInternalState();
      this.restart();
    }
  }

  private onListenData(data: google.firestore.v1.ListenResponse): void {
    this.backoffManager.reset();

    if (data.responseType !== undefined) {
      this.counters.listen.totalResponses[data.responseType]++;
    }

    switch (data.responseType) {
      case 'documentChange':
        assert(data.documentChange);

        this.onDocumentChange(data.documentChange);

        break;
      case 'documentDelete':
        assert(data.documentDelete);

        this.onDocumentDelete(data.documentDelete);

        break;
      case 'documentRemove':
        assert(data.documentRemove);

        this.onDocumentRemove(data.documentRemove);

        break;
      case 'filter':
        assert(data.filter);

        this.onFilter(data.filter);

        break;
      case 'targetChange':
        assert(data.targetChange);

        this.onTargetChange(data.targetChange);

        break;
      default:
        this.emit('error', new Error('Undefined response type.'));
    }
  }

  private onRunQueryData(data: google.firestore.v1.RunQueryResponse): void {
    this.backoffManager.reset();

    if (data.readTime !== null) {
      this.readTime = data.readTime;
    }

    if (data.document !== null) {
      this.counters.runQuery.totalResponses++;

      this.onDocumentChange({ document: data.document });
    }
  }

  private onRunQueryEnd(): void {
    this.initialized = true;

    this.current();

    if (this.isActive()) {
      this.restart();
    }
  }

  private onTargetChange(
    data: NonNullable<google.firestore.v1.ListenResponse['targetChange']>,
  ): void {
    if (data.targetChangeType !== undefined && data.targetChangeType !== null) {
      this.counters.listen.targetChanges[data.targetChangeType]++;
    }

    this.readTime = data.readTime ?? undefined;
    this.resumeToken = data.resumeToken ?? undefined;

    switch (data.targetChangeType) {
      case 'ADD':
        // The targets have been added.
        break;
      case 'CURRENT':
        /*
         * The targets reflect all changes committed before the targets were
         * added to the stream.
         *
         * This will be sent after or with a `readTime` that is greater than or
         * equal to the time at which the targets were added.
         */
        this.current();

        break;
      case 'NO_CHANGE':
        // No change has occurred. Used only to send an updated `resumeToken`.
        break;
      case 'REMOVE':
        /*
         * The targets have been removed. Since it is never requested, it is an
         * internal server error.
         */
        this.restart();

        break;
      case 'RESET':
        /*
         * The targets have been reset, and a new initial state for the targets
         * will be returned in subsequent changes.
         *
         * After the initial state is complete, `CURRENT` will be returned even
         * if the target was previously indicated to be `CURRENT`.
         */
        this.resetInternalState();

        break;
      default:
        this.emit(
          'error',
          new Error(
            `Unsupported target change type: ${String(data.targetChangeType)}.`,
          ),
        );
    }
  }

  private registerAutoPause(): void {
    super.on('newListener', (eventName: string): void => {
      if (events.has(eventName)) {
        this.counters.activeListeners++;

        this.start();
      }
    });

    super.on('removeListener', (eventName: string): void => {
      if (events.has(eventName)) {
        this.counters.activeListeners--;

        if (this.counters.activeListeners === 0) {
          this.stop();
        }
      }
    });
  }

  private resetInternalState(): void {
    this.targetData.clear();
  }

  private restart(): void {
    this.stop();

    setImmediate(this.start.bind(this));
  }

  private start(): void {
    if (this.stream === undefined) {
      this.stream = null;

      this.backoffManager
        .backoffAndWait()
        .then((): void => {
          // Do not attempt to start a stream if it was stopped when waiting.
          if (this.stream !== null) {
            return;
          }

          if (this.initialized) {
            this.stream = this.client.listen(this.getCallOptions());
            this.stream.on('data', this.onListenData.bind(this));
            this.stream.on('error', this.onError.bind(this));

            this.addTarget();
          } else {
            this.stream = this.client.runQuery(
              {
                parent: this.queryTarget.parent,
                structuredQuery: this.queryTarget.structuredQuery,
              },
              this.getCallOptions(),
            );
            this.stream.on('data', this.onRunQueryData.bind(this));
            this.stream.on('end', this.onRunQueryEnd.bind(this));
            this.stream.on('error', this.onError.bind(this));
          }
        })
        .catch((): void => {
          this.restart();
        });
    }
  }

  private stop(): void {
    this.stream?.removeAllListeners();

    // The stream might be e.g. closed by the server in case of server errors.
    if (this.stream?.writable === true) {
      this.stream.end();
    }

    this.backoffManager.reset();

    this.synchronized = false;

    this.usageMetrics.synchronizedDocumentIds.clear();

    delete this.stream;
  }
}

export { Collection };
