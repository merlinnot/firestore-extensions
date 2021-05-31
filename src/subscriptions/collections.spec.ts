import { Firestore, v1 } from '@google-cloud/firestore';
import { once } from 'events';

import { PROJECT_ID } from '../../test/configuration';
import { Collection } from './collections';
import type { ToNativeDocument } from './types';

// See https://issuetracker.google.com/issues/184565314.
jest.retryTimes(5);

/*
 * Test utilities
 */

const firestore = new Firestore();
const client = new v1.FirestoreClient();

const collectionOptions = {
  client,
  converter: (value: ToNativeDocument<object>): ToNativeDocument<object> =>
    value,
  projectId: PROJECT_ID,
  queryTarget: {
    parent: `projects/${PROJECT_ID}/databases/(default)/documents`,
    structuredQuery: { from: [{ collectionId: 'test' }] },
  },
};

const reference = firestore.collection(
  collectionOptions.queryTarget.structuredQuery.from[0].collectionId,
);
const subscription = new Collection(collectionOptions);

/*
 * Setup and teardown
 */

beforeEach((): void => {
  subscription.reset();
});

afterAll(async (): Promise<void> => {
  await Promise.all([client.close(), firestore.terminate()]);

  subscription.removeAllListeners();
});

/*
 * Tests
 */

describe('collection', (): void => {
  it('is not active when there are no listeners', (): void => {
    expect.assertions(1);

    expect(subscription.isActive()).toStrictEqual(false);
  });

  it('is active only when there is a listener', (): void => {
    expect.assertions(2);

    const listener = (): void => {};

    subscription.on('documentAdded', listener);
    expect(subscription.isActive()).toStrictEqual(true);

    subscription.off('documentAdded', listener);
    expect(subscription.isActive()).toStrictEqual(false);
  });

  it('returns a synchronization time', async (): Promise<void> => {
    expect.assertions(1);

    await subscription.synchronize();

    expect(
      Math.abs((subscription.lastSynchronized() ?? 0) - Date.now()),
    ).toBeLessThan(1000);
  });

  describe('synchronization', (): void => {
    it('awaits all documents', async (): Promise<void> => {
      expect.assertions(1);

      await firestore
        .batch()
        .set(reference.doc('1'), {})
        .set(reference.doc('2'), {})
        .set(reference.doc('3'), {})
        .commit();

      await subscription.synchronize();

      expect(subscription.data().size).toStrictEqual(3);
    });

    it('awaits all documents after resuming', async (): Promise<void> => {
      expect.assertions(1);

      await firestore
        .batch()
        .set(reference.doc('1'), {})
        .set(reference.doc('2'), {})
        .set(reference.doc('3'), {})
        .commit();

      await subscription.synchronize();

      await firestore
        .batch()
        .set(reference.doc('3'), {})
        .set(reference.doc('4'), {})
        .set(reference.doc('5'), {})
        .commit();

      await subscription.synchronize();

      expect(subscription.data().size).toStrictEqual(5);
    });

    it('handles concurrent requests', async (): Promise<void> => {
      expect.assertions(0);

      await Promise.all([
        subscription.synchronize(),
        subscription.synchronize(),
      ]);
    });

    it('handles requests when already synchronized', async (): Promise<void> => {
      expect.assertions(0);

      const listener = jest.fn();

      subscription.on('documentAdded', listener);

      await subscription.synchronize();
      await subscription.synchronize();

      subscription.off('documentAdded', listener);
    });
  });

  describe('when active', (): void => {
    it('emits documentAdded events', async (): Promise<void> => {
      expect.assertions(1);

      const addPromise = once(subscription, 'documentAdded');

      await reference.add({});

      const [value] = await addPromise;

      expect(value.data.fields).toStrictEqual({});
    });

    it('emits documentUpdated events', async (): Promise<void> => {
      expect.assertions(2);

      const changePromise = once(subscription, 'documentUpdated');

      await reference.doc('test').set({ version: 1 });
      await subscription.synchronize();

      await reference.doc('test').set({ version: 2 });

      const [update] = await changePromise;

      expect(update.before.fields).toStrictEqual({
        version: { integerValue: '1', valueType: 'integerValue' },
      });
      expect(update.after.fields).toStrictEqual({
        version: { integerValue: '2', valueType: 'integerValue' },
      });
    });

    it('emits documentDeleted events if converter returns undefined', async (): Promise<void> => {
      expect.assertions(0);

      const subscriptionWithConverter = new Collection<
        ToNativeDocument<{ value?: string }>,
        string
      >({
        ...collectionOptions,
        converter: (data): string | undefined => data.fields.value?.stringValue,
      });

      await reference.doc('test').set({ value: 'ok' });

      await subscriptionWithConverter.synchronize();

      const removedPromise = once(subscriptionWithConverter, 'documentDeleted');

      await reference.doc('test').set({});

      await removedPromise;
    });

    it('uses projections for initial synchronization', async (): Promise<void> => {
      expect.assertions(2);

      const converter = jest
        .fn()
        .mockImplementation(<Type>(value: Type): Type => value);

      const subscriptionWithProjection = new Collection({
        ...collectionOptions,
        converter,
        queryTarget: {
          ...collectionOptions.queryTarget,
          structuredQuery: {
            ...collectionOptions.queryTarget.structuredQuery,
            select: {
              fields: [{ fieldPath: 'flat' }, { fieldPath: 'nested.field' }],
            },
          },
        },
      });

      await reference
        .doc('test')
        .set({ flat: 1, nested: { field: 2 }, other: 3 });
      await subscriptionWithProjection.synchronize();

      await reference
        .doc('test')
        .set({ flat: 4, nested: { field: 5 }, other: 6 });
      await subscriptionWithProjection.synchronize();

      expect(converter).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          fields: {
            flat: { integerValue: '1', valueType: 'integerValue' },
            nested: {
              mapValue: {
                fields: {
                  field: { integerValue: '2', valueType: 'integerValue' },
                },
              },
              valueType: 'mapValue',
            },
          },
        }),
      );
      expect(converter).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: {
            flat: { integerValue: '4', valueType: 'integerValue' },
            nested: {
              mapValue: {
                fields: {
                  field: { integerValue: '5', valueType: 'integerValue' },
                },
              },
              valueType: 'mapValue',
            },
            other: { integerValue: '6', valueType: 'integerValue' },
          },
        }),
      );
    });
  });

  describe('when resumed', (): void => {
    it('emits documentAdded events', async (): Promise<void> => {
      expect.assertions(1);

      await reference.add({});

      await subscription.synchronize();

      await reference.add({});

      const [value] = await once(subscription, 'documentAdded');

      expect(value.data.fields).toStrictEqual({});
    });

    it('emits documentUpdated events', async (): Promise<void> => {
      expect.assertions(2);

      await reference.doc('test').set({ version: 1 });

      await subscription.synchronize();

      await reference.doc('test').set({ version: 2 });

      const [update] = await once(subscription, 'documentUpdated');

      expect(update.before.fields).toStrictEqual({
        version: { integerValue: '1', valueType: 'integerValue' },
      });
      expect(update.after.fields).toStrictEqual({
        version: { integerValue: '2', valueType: 'integerValue' },
      });
    });

    it('emits documentDeleted events if converter returns undefined', async (): Promise<void> => {
      expect.assertions(0);

      const subscriptionWithConverter = new Collection<
        ToNativeDocument<{ value?: string }>,
        string
      >({
        ...collectionOptions,
        converter: (data): string | undefined => data.fields.value?.stringValue,
      });

      await reference.doc('test').set({ value: 'ok' });

      await subscriptionWithConverter.synchronize();

      await reference.doc('test').set({});

      await once(subscriptionWithConverter, 'documentDeleted');
    });

    it('streams minimal number of documents added', async (): Promise<void> => {
      expect.assertions(1);

      await firestore
        .batch()
        .set(reference.doc('1'), {})
        .set(reference.doc('2'), {})
        .set(reference.doc('3'), {})
        .commit();

      await subscription.synchronize();

      const before =
        subscription.statistics().listen.totalResponses.documentChange;

      await firestore
        .batch()
        .set(reference.doc('4'), {})
        .set(reference.doc('5'), {})
        .set(reference.doc('6'), {})
        .commit();

      await subscription.synchronize();

      const after =
        subscription.statistics().listen.totalResponses.documentChange;

      /*
       * 3 is an actual expected value, but the emulator misbehaves. It does
       * work when running against an actual database.
       *
       * See https://issuetracker.google.com/issues/183835414.
       */
      expect(after - before).toStrictEqual(6);
    });

    it('streams minimal number of documents changed', async (): Promise<void> => {
      expect.assertions(1);

      await firestore
        .batch()
        .set(reference.doc('1'), {})
        .set(reference.doc('2'), {})
        .set(reference.doc('3'), {})
        .commit();

      await subscription.synchronize();

      const before =
        subscription.statistics().listen.totalResponses.documentChange;

      await firestore
        .batch()
        .set(reference.doc('1'), {})
        .set(reference.doc('2'), {})
        .set(reference.doc('3'), {})
        .commit();

      await subscription.synchronize();

      const after =
        subscription.statistics().listen.totalResponses.documentChange;

      expect(after - before).toStrictEqual(3);
    });

    it('uses projections for initial synchronization', async (): Promise<void> => {
      expect.assertions(2);

      const converter = jest
        .fn()
        .mockImplementation(<Type>(value: Type): Type => value);

      const subscriptionWithProjection = new Collection({
        ...collectionOptions,
        converter,
        queryTarget: {
          ...collectionOptions.queryTarget,
          structuredQuery: {
            ...collectionOptions.queryTarget.structuredQuery,
            select: {
              fields: [{ fieldPath: 'flat' }, { fieldPath: 'nested.field' }],
            },
          },
        },
      });

      await reference
        .doc('test')
        .set({ flat: 1, nested: { field: 2 }, other: 3 });
      await subscriptionWithProjection.synchronize();

      await reference
        .doc('test')
        .set({ flat: 4, nested: { field: 5 }, other: 6 });
      await subscriptionWithProjection.synchronize();

      expect(converter).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          fields: {
            flat: { integerValue: '1', valueType: 'integerValue' },
            nested: {
              mapValue: {
                fields: {
                  field: { integerValue: '2', valueType: 'integerValue' },
                },
              },
              valueType: 'mapValue',
            },
          },
        }),
      );
      expect(converter).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          fields: {
            flat: { integerValue: '4', valueType: 'integerValue' },
            nested: {
              mapValue: {
                fields: {
                  field: { integerValue: '5', valueType: 'integerValue' },
                },
              },
              valueType: 'mapValue',
            },
            other: { integerValue: '6', valueType: 'integerValue' },
          },
        }),
      );
    });
  });

  describe('collects metrics', (): void => {
    it('for added documents', async (): Promise<void> => {
      expect.assertions(1);

      await firestore
        .batch()
        .set(reference.doc('1'), {})
        .set(reference.doc('2'), {})
        .set(reference.doc('3'), {})
        .commit();

      // Reset metrics.
      subscription.metrics();

      await subscription.synchronize();

      expect(subscription.metrics()).toMatchInlineSnapshot(`
        Object {
          "changed": 3,
          "filtered": 0,
          "removed": 0,
        }
      `);
    });

    it('for updated documents', async (): Promise<void> => {
      expect.assertions(1);

      await firestore
        .batch()
        .set(reference.doc('test'), { value: true })
        .commit();

      await subscription.synchronize();

      // Reset metrics.
      subscription.metrics();

      await reference.doc('test').set({ value: false });

      await subscription.synchronize();

      expect(subscription.metrics()).toMatchInlineSnapshot(`
        Object {
          "changed": 1,
          "filtered": 0,
          "removed": 0,
        }
      `);
    });
  });

  it('for removed documents', async (): Promise<void> => {
    expect.assertions(1);

    const subscriptionWithConverter = new Collection<
      ToNativeDocument<{ value?: string }>,
      string
    >({
      ...collectionOptions,
      converter: (data): string | undefined => data.fields.value?.stringValue,
    });

    await firestore
      .batch()
      .set(reference.doc('test'), { value: 'test' })
      .commit();

    await subscriptionWithConverter.synchronize();

    // Reset metrics.
    subscriptionWithConverter.metrics();

    await reference.doc('test').set({});

    await subscriptionWithConverter.synchronize();

    expect(subscriptionWithConverter.metrics()).toMatchInlineSnapshot(`
        Object {
          "changed": 0,
          "filtered": 0,
          "removed": 1,
        }
      `);
  });
});
