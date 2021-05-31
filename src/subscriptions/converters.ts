/* eslint-disable immutable/no-mutation, max-statements */

import { GeoPoint, Timestamp } from '@google-cloud/firestore';
import { strictEqual } from 'assert';

import { assertNever } from '../common/assertions';
import type { Canonical, Native, ToNative } from './types';

const NANOSECONDS_IN_MILLISECOND = 1e6;
const MILLISECONDS_IN_SECOND = 1e3;
const RADIX = 10;

const nullValue: ToNative<null> = {
  nullValue: 'NULL_VALUE',
  valueType: 'nullValue',
};

const toCanonical = <CanonicalType extends Canonical>(
  native: Native,
): CanonicalType => {
  switch (native.valueType) {
    case 'arrayValue':
      return native.arrayValue.values.map(toCanonical) as CanonicalType;

    case 'booleanValue':
      return native.booleanValue as CanonicalType;

    case 'doubleValue':
      return native.doubleValue as CanonicalType;

    case 'geoPointValue':
      return new GeoPoint(
        native.geoPointValue.latitude,
        native.geoPointValue.longitude,
      ) as CanonicalType;

    case 'integerValue':
      return Number.parseInt(native.integerValue, RADIX) as CanonicalType;

    case 'mapValue': {
      const result: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(native.mapValue.fields ?? {})) {
        result[key] = toCanonical(value);
      }

      return result as CanonicalType;
    }

    case 'nullValue':
      return null as CanonicalType;

    case 'stringValue':
      return native.stringValue as CanonicalType;

    case 'timestampValue':
      return new Timestamp(
        typeof native.timestampValue.seconds === 'number'
          ? native.timestampValue.seconds
          : Number.parseInt(native.timestampValue.seconds, RADIX),
        native.timestampValue.nanos,
      ) as CanonicalType;

    default:
      return assertNever(native);
  }
};

const toId = (name: string): string => {
  const parts = name.split('/');

  return parts[parts.length - 1];
};

const toMilliseconds = ({
  nanos,
  seconds,
}: {
  nanos: number;
  seconds: number | string;
}): number =>
  (typeof seconds === 'number' ? seconds : Number.parseInt(seconds, 10)) *
    MILLISECONDS_IN_SECOND +
  Math.round(nanos / NANOSECONDS_IN_MILLISECOND);

const toNative = <CanonicalType extends Canonical>(
  canonical: CanonicalType,
): ToNative<CanonicalType> => {
  if (typeof canonical === 'boolean') {
    const booleanValue: ToNative<boolean> = {
      booleanValue: canonical,
      valueType: 'booleanValue',
    };

    return booleanValue as ToNative<CanonicalType>;
  } else if (typeof canonical === 'number') {
    const numberValue: ToNative<number> = Number.isInteger(canonical)
      ? {
          integerValue: canonical.toString(RADIX),
          valueType: 'integerValue',
        }
      : {
          doubleValue: canonical,
          valueType: 'doubleValue',
        };

    return numberValue as ToNative<CanonicalType>;
  } else if (typeof canonical === 'string') {
    const stringValue: ToNative<string> = {
      stringValue: canonical,
      valueType: 'stringValue',
    };

    return stringValue as ToNative<CanonicalType>;
  } else if (Array.isArray(canonical)) {
    const arrayValue: ToNative<Canonical[]> = {
      arrayValue: {
        values: canonical.map(
          (value: object): ToNative<object> => toNative(value),
        ),
      },
      valueType: 'arrayValue',
    };

    return arrayValue as ToNative<CanonicalType>;
  } else if (canonical instanceof GeoPoint) {
    const geoPointValue: ToNative<GeoPoint> = {
      geoPointValue: {
        latitude: canonical.latitude,
        longitude: canonical.longitude,
      },
      valueType: 'geoPointValue',
    };

    return geoPointValue as ToNative<CanonicalType>;
  } else if (canonical instanceof Timestamp) {
    const timestampValue: ToNative<Timestamp> = {
      timestampValue: {
        nanos: canonical.nanoseconds,
        seconds: canonical.seconds,
      },
      valueType: 'timestampValue',
    };

    return timestampValue as ToNative<CanonicalType>;
  } else if (typeof canonical === 'object' && canonical !== null) {
    const mapValue: ToNative<object> = {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(canonical as { [Key: string]: Canonical }).map(
            ([key, value]: [string, Canonical]): [
              string,
              ToNative<Canonical>,
            ] => [key, toNative(value)],
          ),
        ),
      },
      valueType: 'mapValue',
    };

    return mapValue as ToNative<CanonicalType>;
  } else {
    strictEqual(canonical, null);

    return nullValue as ToNative<CanonicalType>;
  }
};

const toNumber = (
  value:
    | { doubleValue: number; valueType: 'doubleValue' }
    | { integerValue: string; valueType: 'integerValue' },
): number =>
  'doubleValue' in value
    ? value.doubleValue
    : Number.parseInt(value.integerValue, 10);

export { toCanonical, toId, toMilliseconds, toNative, toNumber };
