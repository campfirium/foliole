export type LiteralUnionValue = number | string;

export function parseLiteralUnion<T extends LiteralUnionValue>(
  value: unknown,
  allowedValues: readonly T[]
): T | null {
  return allowedValues.find((allowedValue) => allowedValue === value) ?? null;
}
