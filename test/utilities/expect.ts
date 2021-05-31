// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Constructor<Type> = new (...arguments_: any[]) => Type;

/**
 * Asserts that a value is of a given instance.
 *
 * The jest `toBeInstanceOf` function does not have strict typing, they also
 * can not be corrected with its current architecture.
 */
export const expectToBeInstanceOf: <Type>(
  value: unknown,
  className: Constructor<Type>,
) => asserts value is Type = <Type>(
  value: unknown,
  className: Constructor<Type>,
): asserts value is Type => {
  expect(value).toBeInstanceOf(className);
};
