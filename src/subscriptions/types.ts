import type { GeoPoint, Timestamp, v1 } from '@google-cloud/firestore';
/*
 * While private API imports are generally a bad practice, reimplementing the
 * functionality would result in higher maintenance costs than adjusting to
 * changes in the dependency internals.
 */
import type { google } from '@google-cloud/firestore/build/protos/firestore_v1_proto_api';

type CanonicalPrimitive = boolean | number | string | null;
type CanonicalComposite = GeoPoint | Timestamp;
type CanonicalMulti = object[] | object;
type Canonical = CanonicalComposite | CanonicalMulti | CanonicalPrimitive;

type Native =
  | {
      arrayValue: {
        values: Array<Exclude<Native, { valueType: 'arrayValue' }>>;
      };
      valueType: 'arrayValue';
    }
  | {
      geoPointValue: { latitude: number; longitude: number };
      valueType: 'geoPointValue';
    }
  | {
      mapValue: {
        fields?: Record<string, Native>;
      };
      valueType: 'mapValue';
    }
  | {
      timestampValue: { nanos: number; seconds: number | string };
      valueType: 'timestampValue';
    }
  | { booleanValue: boolean; valueType: 'booleanValue' }
  | { doubleValue: number; valueType: 'doubleValue' }
  | { integerValue: string; valueType: 'integerValue' }
  | { nullValue: 'NULL_VALUE'; valueType: 'nullValue' }
  | { stringValue: string; valueType: 'stringValue' };

type ToNativePrimitive<FirestoreCanonicalType extends CanonicalPrimitive> =
  FirestoreCanonicalType extends boolean
    ?
        | ToNative<Exclude<FirestoreCanonicalType, boolean>>
        | { booleanValue: boolean; valueType: 'booleanValue' }
    : FirestoreCanonicalType extends null
    ?
        | ToNative<Exclude<FirestoreCanonicalType, null>>
        | { nullValue: 'NULL_VALUE'; valueType: 'nullValue' }
    : FirestoreCanonicalType extends number
    ?
        | ToNative<Exclude<FirestoreCanonicalType, number>>
        | { doubleValue: number; valueType: 'doubleValue' }
        | { integerValue: string; valueType: 'integerValue' }
    :
        | ToNative<Exclude<FirestoreCanonicalType, string>>
        | { stringValue: FirestoreCanonicalType; valueType: 'stringValue' };

type ToNativeComposite<CanonicalType extends CanonicalComposite> =
  CanonicalType extends GeoPoint
    ?
        | ToNative<Exclude<CanonicalType, GeoPoint>>
        | {
            geoPointValue: { latitude: number; longitude: number };
            valueType: 'geoPointValue';
          }
    :
        | ToNative<Exclude<CanonicalType, Timestamp>>
        | {
            timestampValue: { nanos: number; seconds: number | string };
            valueType: 'timestampValue';
          };

type ToNativeMulti<CanonicalType extends CanonicalMulti> =
  CanonicalType extends unknown[]
    ? {
        arrayValue: {
          values: {
            [Key in keyof CanonicalType]: ToNative<CanonicalType[Key]>;
          };
        };
        valueType: 'arrayValue';
      }
    : CanonicalType extends object
    ? {
        mapValue: {
          fields: {
            [Key in keyof CanonicalType]: ToNative<CanonicalType[Key]>;
          };
        };
        valueType: 'mapValue';
      }
    : never;

type ToNative<CanonicalType> = CanonicalType extends CanonicalPrimitive
  ? ToNativePrimitive<CanonicalType>
  : CanonicalType extends CanonicalComposite
  ? ToNativeComposite<CanonicalType>
  : CanonicalType extends CanonicalMulti
  ? ToNativeMulti<CanonicalType>
  : never;

/**
 * Converts a canonical Firestore entity type into native (API) representation.
 */
interface ToNativeDocument<CanonicalType extends object> {
  createTime: { nanos: number; seconds: number | string };
  fields: ToNativeMulti<CanonicalType>['mapValue']['fields'];
  name: string;
  updateTime: { nanos: number; seconds: number | string };
}

/**
 * Converts a native Firestore entity type into canonical (SDK) representation.
 */
type ToCanonicalDocument<NativeType extends Native> =
  NativeType extends ToNativeDocument<infer CanonicalType>
    ? CanonicalType
    : never;

/**
 * Transforms a native representation of a document to a desired one.
 *
 * Documents are treated as deleted if the converter returns `undefined`.
 */
type Converter<NativeType extends ToNativeDocument<object>, TargetType> = (
  data: NativeType,
) => TargetType | undefined;

/**
 *  The Cloud Firestore service.
 */
type Client = InstanceType<typeof v1.FirestoreClient>;

/**
 * A target specified by a query.
 *
 * See {@link https://cloud.google.com/firestore/docs/reference/rpc/google.firestore.v1#querytarget RCP reference}.
 */
type QueryTarget = google.firestore.v1.Target.IQueryTarget;

interface DocumentAddedEventData<DocumentType> {
  data: DocumentType;
  id: string;
}

interface DocumentUpdatedEventData<DocumentType> {
  after: DocumentType;
  before: DocumentType;
  id: string;
}

interface DocumentDeletedEventData {
  id: string;
}

export type {
  Canonical,
  CanonicalComposite,
  CanonicalMulti,
  CanonicalPrimitive,
  Client,
  Converter,
  DocumentAddedEventData,
  DocumentDeletedEventData,
  DocumentUpdatedEventData,
  google,
  Native,
  QueryTarget,
  ToCanonicalDocument,
  ToNative,
  ToNativeDocument,
};
