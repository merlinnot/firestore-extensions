import {
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  FieldPath,
  Firestore,
  Timestamp,
} from '@google-cloud/firestore';
import { path } from 'ramda';

import { ExistingDocument } from '../src';

export const firestore = new Firestore();

type UnknownFieldPath = FieldPath & {
  segments?: unknown;
};

type FieldPathWithSegments = FieldPath & {
  segments: string[];
};

/**
 * This assertion check exists in case the underlying Firestore FieldPath
 * implementation changes.  Tests need to break to prevent unexpected behavior.
 */
const assertFieldPathWithSegments: (
  fieldPath: UnknownFieldPath,
) => asserts fieldPath is FieldPathWithSegments = (
  fieldPath: UnknownFieldPath,
): asserts fieldPath is FieldPathWithSegments => {
  if (Array.isArray(fieldPath.segments) === false) {
    throw new Error(
      'FieldPath missing "segments" array property as required for test utility.',
    );
  }
};

const createDocumentSnapshot = (
  DocumentSnapshot as unknown as {
    fromObject: (
      reference: DocumentReference,
      object: DocumentData,
    ) => DocumentSnapshot;
  }
).fromObject.bind(DocumentSnapshot);

const pathToDocumentReference = (documentPath: string): DocumentReference => {
  const trimmedPath = documentPath.replace(/^\/+|\/+$/u, '');
  const position = trimmedPath.lastIndexOf('/');

  return position === -1
    ? firestore.collection(documentPath).doc()
    : firestore
        .collection(trimmedPath.slice(0, position))
        .doc(trimmedPath.slice(position + 1));
};

export const makeDocumentSnapshot = <
  Entity extends DocumentData | undefined = DocumentData | undefined,
>(
  data: Entity,
  referenceOrPath: DocumentReference | string,
  options?: { createTime?: Timestamp; updateTime?: Timestamp },
): Entity extends undefined ? DocumentSnapshot : ExistingDocument<Entity> => {
  const documentReference =
    referenceOrPath instanceof DocumentReference
      ? referenceOrPath
      : pathToDocumentReference(referenceOrPath);

  const documentSnapshot = createDocumentSnapshot(
    documentReference,
    data ?? {},
  );

  Object.defineProperty(documentSnapshot, 'exists', {
    get: (): boolean => data !== undefined,
  });

  Object.defineProperty(documentSnapshot, 'readTime', {
    get: (): number => 0,
  });

  Object.defineProperty(documentSnapshot, 'data', {
    value: (): unknown => data,
  });

  Object.defineProperty(documentSnapshot, 'get', {
    value: (fieldPath: FieldPath): unknown => {
      assertFieldPathWithSegments(fieldPath);

      return path(fieldPath.segments, data);
    },
  });

  Object.defineProperty(documentSnapshot, 'createTime', {
    value: options?.createTime ?? Timestamp.now(),
  });

  Object.defineProperty(documentSnapshot, 'updateTime', {
    configurable: true,
    value: options?.updateTime ?? Timestamp.now(),
  });

  return documentSnapshot as Entity extends undefined
    ? DocumentSnapshot
    : ExistingDocument<Entity>;
};
