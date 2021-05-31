import * as fc from 'fast-check';

import { idToUuid, uuidToId } from '.';

const FIRESTORE_ID_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const FIRESTORE_ID_LENGTH = 20;

const arbitraryId = fc
  .array(
    fc
      .integer(0, FIRESTORE_ID_ALPHABET.length)
      .map((index: number): string => FIRESTORE_ID_ALPHABET[index]),
    20,
    20,
  )
  .map((array: string[]): string => array.join(''))
  .noShrink()
  .filter((id: string): boolean => id.length === FIRESTORE_ID_LENGTH);

describe('uuid conversion', (): void => {
  it.each([
    ['A'.repeat(FIRESTORE_ID_LENGTH), '00000000-0000-4000-8000-000000000000'],
    ['9'.repeat(FIRESTORE_ID_LENGTH), 'f7df7df7-df7d-4f7d-bdf7-df7df7df7df4'],
  ])(
    'produces a correct counterpart for edge case %s',
    (id: string, uuid: string): void => {
      expect.assertions(2);

      expect(idToUuid(id)).toStrictEqual(uuid);
      expect(uuidToId(uuid)).toStrictEqual(id);
    },
  );

  it('is reversible', (): void => {
    expect.assertions(0);

    fc.assert(
      fc.property(
        arbitraryId,
        (id: string): boolean => id === uuidToId(idToUuid(id)),
      ),
    );
  });
});
