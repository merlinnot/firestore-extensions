/**
 * Checks that the given value is of type `never` — the type that’s left after
 * all other cases have been removed.
 *
 * @param value A value of type `never`.
 */
const assertNever = (value: never): never => {
  throw new Error(
    `Unhandled discriminated union member: ${JSON.stringify(value)}.`,
  );
};

export { assertNever };
