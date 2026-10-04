/** Existing source epochs are opaque; a completed restore may publish its restore ID. */
export function isSyncIdentitySourceEpoch(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 &&
    value.trim() === value;
}
