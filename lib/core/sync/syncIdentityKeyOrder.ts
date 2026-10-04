const encoder = new TextEncoder();

/** Match SQLite's default BINARY collation for TEXT identity keys. */
export function compareSyncIdentityText(left: string, right: string) {
  if (left === right) return 0;
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index]! < b[index]! ? -1 : 1;
  }
  return a.length < b.length ? -1 : 1;
}

export function compareSyncIdentityKey(left: { object_type: string; object_id: string },
  right: { object_type: string; object_id: string }) {
  return compareSyncIdentityText(left.object_type, right.object_type) ||
    compareSyncIdentityText(left.object_id, right.object_id);
}
