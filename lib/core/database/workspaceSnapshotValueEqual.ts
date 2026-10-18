/** Snapshot values are JSON-shaped; object insertion order has no meaning. */
export function workspaceSnapshotValueEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
      left.every((value, index) => workspaceSnapshotValueEqual(value, right[index]));
  }
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const entries = Object.entries(left).filter(([, value]) => value !== undefined);
  const other = Object.fromEntries(Object.entries(right).filter(([, value]) => value !== undefined));
  return entries.length === Object.keys(other).length && entries.every(([key, value]) =>
    Object.prototype.hasOwnProperty.call(other, key) && workspaceSnapshotValueEqual(value, other[key]));
}
