/* cspell:ignore promisify */

import {
  Client,
  credentials,
  GrpcObject,
  loadPackageDefinition,
} from '@grpc/grpc-js';
import { load } from '@grpc/proto-loader';
import { strict as assert } from 'assert';
import { resolve } from 'path';
import { once, path } from 'ramda';

import {
  FIRESTORE_SERVICE_HOSTNAME,
  FIRESTORE_SERVICE_PORT,
  PROJECT_ID,
} from '../../configuration';

const PROTO_ROOT = resolve(__dirname, 'protocols');
const PROTO_FILE = 'google/firestore/emulator/v1/firestore_emulator.proto';

const makeEmulatorClient = once<() => Promise<Client & unknown>>(
  async (): Promise<Client> => {
    /* eslint-disable unicorn/prevent-abbreviations */
    const packageDefinition = await load(PROTO_FILE, {
      includeDirs: [PROTO_ROOT],
    });
    /* eslint-enable unicorn/prevent-abbreviations */

    const protoDescriptor = loadPackageDefinition(packageDefinition);
    const service = path<GrpcObject>(
      ['google', 'firestore', 'emulator', 'v1'],
      protoDescriptor,
    );

    assert(service);

    const FirestoreEmulator = service.FirestoreEmulator as typeof Client;

    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    const address = `${FIRESTORE_SERVICE_HOSTNAME}:${FIRESTORE_SERVICE_PORT}`;
    const sslCredentials = credentials.createInsecure();

    return new FirestoreEmulator(address, sslCredentials);
  },
);

export const clearFirestoreData = async (): Promise<void> => {
  const client = await makeEmulatorClient();
  const database = `projects/${PROJECT_ID}/databases/(default)`;

  /*
   * Do not convert this implementation to use `promisify` as it seemingly
   * breaks the functionality.
   */
  return new Promise((resolvePromise: unknown): void => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).clearData({ database }, resolvePromise);
  });
};
