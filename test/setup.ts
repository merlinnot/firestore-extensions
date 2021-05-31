import * as nock from 'nock';

import { LOCALHOST_HOST_MATCHERS } from './configuration';
import { clearFirestoreData } from './services/firestore';

jest.setTimeout(3000);

jest.spyOn(console, 'log').mockImplementation();

beforeAll(async (): Promise<void> => {
  nock.enableNetConnect(new RegExp(LOCALHOST_HOST_MATCHERS, 'u'));
});

afterEach(async (): Promise<void> => {
  // Reset all mocks after each test run.
  jest.clearAllMocks();
  jest.resetAllMocks();
  jest.restoreAllMocks();

  // Assert all HTTP mocks were called.
  if (nock.isDone() !== true) {
    const pending = nock.pendingMocks();

    nock.cleanAll();

    /* eslint-disable-next-line max-len */
    /* eslint-disable-next-line @typescript-eslint/restrict-template-expressions */
    throw new Error(`Pending mocks detected: ${pending}.`);
  }

  // Reset network recording after each test run.
  nock.restore();
  nock.activate();

  // Clear databases.
  await clearFirestoreData();
});
