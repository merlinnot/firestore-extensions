/* eslint-disable immutable/no-mutation, immutable/no-this */

import { v1 } from '@google-cloud/firestore';
import type { ClientOptions } from 'google-gax';

import { Collection } from './collections';
import type { Client, Converter, QueryTarget, ToNativeDocument } from './types';

/**
 * EXPERIMENTAL
 *
 * The API can change in a backwards-incompatible way without prior notice.
 */
class Repository {
  private readonly client: Client;

  private readonly projectId: string;

  public constructor(clientOptions: ClientOptions & { projectId: string }) {
    this.client = new v1.FirestoreClient(clientOptions);
    this.projectId = clientOptions.projectId;
  }

  public async close(): Promise<void> {
    await this.client.close();
  }

  /**
   * Creates a collection subscription for a given target.
   *
   * @param target Query target.
   * @param converter A method which transforms documents into their desired
   * representation, e.g. a format returned by the overlying API.
   */
  public makeCollectionSubscription<
    NativeType extends ToNativeDocument<object>,
    TargetType,
  >(
    { parent = this.makeDefaultParent(), structuredQuery }: QueryTarget,
    converter: Converter<NativeType, TargetType>,
  ): Collection<NativeType, TargetType> {
    return new Collection({
      client: this.client,
      converter,
      projectId: this.projectId,
      queryTarget: { parent, structuredQuery },
    });
  }

  /**
   * Creates a parent pointing to a default database.
   *
   * @example
   * // Returns a reference to a document.
   * makeDefaultParent('documents/my-collection/my-document');
   */
  public makeDefaultParent(suffix: string = 'documents'): string {
    return `projects/${this.projectId}/databases/(default)/${suffix}`;
  }
}

export { Repository };
