import { env as environment } from 'process';
import { v4 } from 'uuid';

/*
 * Start every worker with a separate project ID so parallel test runs to not
 * interfere with each other.
 */
export const PROJECT_ID = v4();

export const FIRESTORE_SERVICE_HOSTNAME =
  typeof environment.FIRESTORE_SERVICE_HOSTNAME === 'string'
    ? environment.FIRESTORE_SERVICE_HOSTNAME
    : 'localhost';
export const FIRESTORE_SERVICE_PORT = 4500;

export const LOCALHOST_HOST_MATCHERS =
  typeof environment.LOCALHOST_HOST_MATCHERS === 'string'
    ? environment.LOCALHOST_HOST_MATCHERS
    : '127.0.0.1|localhost|0.0.0.0';
