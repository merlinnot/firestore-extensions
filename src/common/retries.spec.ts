/* eslint-disable no-await-in-loop */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable no-constant-condition */

import { nextTick } from 'process';

import { makeExponentialBackoffManager } from './retries';

const useSetTimeoutImmediateInvocation = (): jest.SpyInstance<
  NodeJS.Timeout,
  [
    callback: (...arguments_: unknown[]) => void,
    ms?: number | undefined,
    ...arguments_: unknown[]
  ]
> =>
  jest.spyOn(global, 'setTimeout').mockImplementation(
    (callback: () => void): NodeJS.Timeout =>
      /* eslint-disable @typescript-eslint/no-confusing-void-expression */
      callback() as unknown as NodeJS.Timeout,
    /* eslint-enable @typescript-eslint/no-confusing-void-expression */
  );

const useSetTimeoutNextTickInvocation = (): jest.SpyInstance<
  NodeJS.Timeout,
  [
    callback: (...arguments_: unknown[]) => void,
    ms?: number | undefined,
    ...arguments_: unknown[]
  ]
> =>
  jest.spyOn(global, 'setTimeout').mockImplementation(
    (callback: () => void): NodeJS.Timeout =>
      /* eslint-disable @typescript-eslint/no-confusing-void-expression */
      nextTick(callback) as unknown as NodeJS.Timeout,
    /* eslint-enable @typescript-eslint/no-confusing-void-expression */
  );

describe('exponentialBackoffManager', (): void => {
  it('throws an error when called while awaiting', async (): Promise<void> => {
    expect.assertions(1);

    useSetTimeoutNextTickInvocation();

    const manager = makeExponentialBackoffManager();

    try {
      await Promise.all([manager.backoffAndWait(), manager.backoffAndWait()]);
    } catch (error) {
      expect(error).toMatchInlineSnapshot(
        `[Error: A backoff operation is already in progress.]`,
      );
    }
  });

  it('follows exponential progression (disregarding jitter)', async (): Promise<void> => {
    expect.assertions(1);

    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const setTimeoutSpy = useSetTimeoutImmediateInvocation();

    const manager = makeExponentialBackoffManager();

    try {
      while (true) {
        await manager.backoffAndWait();
      }
    } catch {
      expect(
        setTimeoutSpy.mock.calls.map(([, delay]: unknown[]): unknown => delay),
      ).toMatchInlineSnapshot(`
        Array [
          0,
          1000,
          1500,
          2250,
          3375,
          5062.5,
          7593.75,
          11390.625,
          17085.9375,
          25628.90625,
        ]
      `);
    }
  });

  it('resets the internal state to zero', async (): Promise<void> => {
    expect.assertions(1);

    const setTimeoutSpy = useSetTimeoutImmediateInvocation();

    const manager = makeExponentialBackoffManager();

    await manager.backoffAndWait();
    manager.reset();
    await manager.backoffAndWait();

    expect(
      setTimeoutSpy.mock.calls.map(([, delay]: unknown[]): unknown => delay),
    ).toMatchInlineSnapshot(`
      Array [
        0,
        0,
      ]
    `);
  });
});
