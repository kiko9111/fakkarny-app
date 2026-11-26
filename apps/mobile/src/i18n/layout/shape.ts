/**
 * The English table of an area must have exactly the Arabic table's keys: a missing key fails
 * the build here, an extra one fails as an unknown property. (As `DeepStringShape` in strings.ts.)
 */
export type SameKeys<T> = {
  [K in keyof T]: T[K] extends string ? string : T[K] extends readonly string[] ? string[] : SameKeys<T[K]>;
};
