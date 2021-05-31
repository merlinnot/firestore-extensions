/* eslint-disable immutable/no-mutation, max-classes-per-file */

import firestore from '@google-cloud/firestore';
import { credentials } from '@grpc/grpc-js';

import {
  FIRESTORE_SERVICE_HOSTNAME,
  FIRESTORE_SERVICE_PORT,
  PROJECT_ID,
} from '../../../test/configuration';

class Firestore extends firestore.Firestore {
  public constructor() {
    super({
      /* cspell:disable */
      port: FIRESTORE_SERVICE_PORT,
      projectId: PROJECT_ID,
      servicePath: FIRESTORE_SERVICE_HOSTNAME,
      ssl: false,
      /* cspell:enable */
    });
  }
}

class FirestoreClient extends firestore.v1.FirestoreClient {
  public constructor() {
    super({
      /* cspell:disable */
      port: FIRESTORE_SERVICE_PORT,
      projectId: PROJECT_ID,
      servicePath: FIRESTORE_SERVICE_HOSTNAME,
      ssl: false,
      sslCreds: credentials.createInsecure(),
      /* cspell:enable */
    });
  }
}

module.exports = {
  ...firestore,
  Firestore,
  v1: { ...firestore.v1, FirestoreClient },
};
