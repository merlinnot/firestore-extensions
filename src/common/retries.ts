/* eslint-disable immutable/no-mutation */

/**
 * The default initial backoff time in milliseconds after an error.
 *
 * Set to 1 second according to https://cloud.google.com/apis/design/errors.
 */
const BACKOFF_INITIAL_DELAY_MS = 1000;

/**
 * The default maximum backoff time in milliseconds.
 */
const BACKOFF_MAX_DELAY_MS = 60_000;

/**
 * The default factor to increase the backup by after each failed attempt.
 */
const BACKOFF_FACTOR = 1.5;

/**
 * The default jitter to distribute the backoff attempts by (0 means no
 * randomization, 1.0 means +/-50% randomization).
 */
const JITTER_FACTOR = 1;

/**
 * A middle of the range of values returned by math.random().
 */
const MATH_RAND_MIDPOINT = 0.5;

/**
 * The maximum number of retries that will be attempted by backoff
 * before stopping all retry attempts.
 */
const MAX_RETRY_ATTEMPTS = 10;

/**
 * Returns a randomized jitter delay based on the current base and jitter
 * factor.
 *
 * @returns The jitter to apply based on the current delay.
 */
const delayWithJitter = (delayMs: number): number =>
  delayMs + (Math.random() - MATH_RAND_MIDPOINT) * JITTER_FACTOR * delayMs;

interface ExponentialBackoffState {
  /**
   * Whether a backoff completion is currently being awaited.
   */
  awaitingBackoffCompletion: boolean;
  /**
   * The backoff delay of the current attempt.
   */
  currentBaseMs: number;
  /**
   * The number of retries that has been attempted.
   */
  retryCount: number;
}

interface ExponentialBackoffManager {
  /**
   * Returns a promise that resolves after a delay, and increases the
   * delay for any subsequent attempts.
   *
   * @returns A Promise that resolves when the current delay elapsed.
   */
  backoffAndWait: () => Promise<void>;
  /**
   * Resets the backoff delay and retry count.
   *
   * The very next backoffAndWait() will have no delay. If it is called again
   * (i.e. due to an error), initial delay (plus jitter) will be used, and
   * subsequent ones will increase according to the backoff factor.
   */
  reset: () => void;
}

const makeBackoffAndWait =
  (
    mutableState: ExponentialBackoffState,
  ): ExponentialBackoffManager['backoffAndWait'] =>
  async (): ReturnType<ExponentialBackoffManager['backoffAndWait']> => {
    if (mutableState.awaitingBackoffCompletion) {
      throw new Error('A backoff operation is already in progress.');
    }

    if (mutableState.retryCount >= MAX_RETRY_ATTEMPTS) {
      throw new Error('Exceeded maximum number of retries allowed.');
    }

    // First schedule using the current base (which may be 0).
    const delayWithJitterMs = delayWithJitter(mutableState.currentBaseMs);

    /*
     * Apply backoff factor to determine next delay and ensure it is within
     * bounds.
     */
    mutableState.currentBaseMs = Math.min(
      Math.max(
        mutableState.currentBaseMs * BACKOFF_FACTOR,
        BACKOFF_INITIAL_DELAY_MS,
      ),
      BACKOFF_MAX_DELAY_MS + BACKOFF_MAX_DELAY_MS * MATH_RAND_MIDPOINT,
    );
    mutableState.retryCount++;

    mutableState.awaitingBackoffCompletion = true;

    return new Promise((resolve: () => void): void => {
      setTimeout((): void => {
        mutableState.awaitingBackoffCompletion = false;

        resolve();
      }, delayWithJitterMs);
    });
  };

const makeReset =
  (mutableState: ExponentialBackoffState): ExponentialBackoffManager['reset'] =>
  (): ReturnType<ExponentialBackoffManager['reset']> => {
    mutableState.currentBaseMs = 0;
    mutableState.retryCount = 0;
  };

const makeExponentialBackoffManager = (): ExponentialBackoffManager => {
  const mutableState: ExponentialBackoffState = {
    awaitingBackoffCompletion: false,
    currentBaseMs: 0,
    retryCount: 0,
  };

  return {
    backoffAndWait: makeBackoffAndWait(mutableState),
    reset: makeReset(mutableState),
  };
};

export { makeExponentialBackoffManager };
export type { ExponentialBackoffManager };
