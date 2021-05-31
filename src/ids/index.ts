/**
 * @file Provides methods to convert Firestore IDs to UUID v4 and back.
 *
 * An artificial radix is used for of the Firestore ID translation.
 *
 * Although the actual alphabet is of length 62, it becomes more complex (both
 * in terms of the implementation and the number of computations) when an
 * arbitrary base is used, instead of a power of two. Therefore the smallest
 * power of two greater than the actual base is used. It is small enough so that
 * it can be represented in less than 122 bytes, which is a limitation of UUID
 * v4.
 */

import { splitEvery } from 'ramda';

/**
 * A string consisting of characters `0` and `1`.
 */
type BitString = string;

const BITS_IN_BASE64_CHARACTER = 6;
const BITS_IN_HEX_CHARACTER = 4;
const RADIX_16 = 16;
const RADIX_2 = 2;
const UUID_SIZE_BITS = 128;

/**
 * Alphabet used in generation of Firestore IDs.
 *
 * Copied from and validated against open source software development kits of
 * Firestore.
 */
const FIRESTORE_ID_ALPHABET: string =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Length of a Firestore IDs.
 *
 * Copied from and validated against open source software development kits of
 * Firestore.
 */
const FIRESTORE_ID_LENGTH = 20;

/**
 * A map of characters from the alphabet to their index.
 */
const FIRESTORE_ID_ALPHABET_POSITION_LOOKUP: {
  [Letter: string]: number;
} = FIRESTORE_ID_ALPHABET.split('').reduce(
  (
    accumulator: { [Letter: string]: number },
    value: string,
    index: number,
  ): { [Letter: string]: number } => ({ ...accumulator, [value]: index }),
  {},
);

/**
 * Transforms a Firestore ID in original alphabet into a BitString.
 */
const firestoreIdToBitString = (id: string): BitString =>
  id
    .split('')
    .map(
      (character: string): BitString =>
        FIRESTORE_ID_ALPHABET_POSITION_LOOKUP[character]
          .toString(RADIX_2)
          .padStart(BITS_IN_BASE64_CHARACTER, '0'),
    )
    .join('');

/**
 * Transforms a BitString to a Firestore ID using the original alphabet.
 */
const bitStringToFirestoreId = (bitString: BitString): string =>
  splitEvery(BITS_IN_BASE64_CHARACTER, bitString)
    .map(
      (character: BitString): string =>
        FIRESTORE_ID_ALPHABET[Number.parseInt(character, RADIX_2)],
    )
    .join('');

/**
 * Describes static parts of the UUID v4 as per
 * https://tools.ietf.org/html/rfc4122.
 */
const STATIC_BIT_PARTS: Array<{ part: BitString; startIndex: number }> = [
  { part: '0100', startIndex: 48 },
  { part: '10', startIndex: 64 },
];

/**
 * Number of bits missing
 */
const MISSING_BITS =
  UUID_SIZE_BITS -
  (FIRESTORE_ID_LENGTH * BITS_IN_BASE64_CHARACTER +
    STATIC_BIT_PARTS[0].part.length +
    STATIC_BIT_PARTS[1].part.length);

/**
 * Inserts static parts of an UUID v4 to a BitString.
 */
const insertStaticBitParts = (bitString: BitString): BitString =>
  [
    bitString.slice(0, STATIC_BIT_PARTS[0].startIndex),
    STATIC_BIT_PARTS[0].part,
    bitString.slice(
      STATIC_BIT_PARTS[0].startIndex,
      STATIC_BIT_PARTS[1].startIndex - STATIC_BIT_PARTS[0].part.length,
    ),
    STATIC_BIT_PARTS[1].part,
    bitString.slice(
      STATIC_BIT_PARTS[1].startIndex - STATIC_BIT_PARTS[0].part.length,
    ),
    '0'.repeat(MISSING_BITS),
  ].join('');

/**
 * Removes static parts from an UUID BitString.
 */
const removeStaticParts = (bitString: BitString): BitString =>
  [
    bitString.slice(0, STATIC_BIT_PARTS[0].startIndex),
    bitString.slice(
      STATIC_BIT_PARTS[0].startIndex + STATIC_BIT_PARTS[0].part.length,
      STATIC_BIT_PARTS[1].startIndex,
    ),
    bitString.slice(
      STATIC_BIT_PARTS[1].startIndex + STATIC_BIT_PARTS[1].part.length,
      bitString.length - MISSING_BITS,
    ),
  ].join('');

/* eslint-disable @typescript-eslint/no-magic-numbers */
/**
 * Positions in the UUID string, where hyphens should appear.
 *
 * Represented as an array to leverage performance of iterations over short
 * arrays.
 */
const hyphenPositions: Set<number> = new Set([8, 12, 16, 20]);
/* eslint-enable @typescript-eslint/no-magic-numbers */

/**
 * Converts BitString to an UUID string format.
 */
const bitStringToUuid = (bitString: BitString): string =>
  splitEvery(BITS_IN_HEX_CHARACTER, bitString).reduce(
    (accumulator: string, currentValue: string, currentIndex: number): string =>
      `${accumulator}${Number.parseInt(currentValue, RADIX_2).toString(
        RADIX_16,
      )}${hyphenPositions.has(currentIndex + 1) ? '-' : ''}`,
    '',
  );

/**
 * Converts a UUID to a BitString.
 */
const uuidToBitString = (uuid: string): BitString =>
  uuid
    .split('')
    .reduce(
      (accumulator: BitString, currentValue: string): BitString =>
        currentValue === '-'
          ? accumulator
          : `${accumulator}${Number.parseInt(currentValue, RADIX_16)
              .toString(RADIX_2)
              .padStart(BITS_IN_HEX_CHARACTER, '0')}`,
      '',
    );

const idToUuid = (id: string): string =>
  bitStringToUuid(insertStaticBitParts(firestoreIdToBitString(id)));

const uuidToId = (uuid: string): string =>
  bitStringToFirestoreId(removeStaticParts(uuidToBitString(uuid)));

export { idToUuid, uuidToId };
