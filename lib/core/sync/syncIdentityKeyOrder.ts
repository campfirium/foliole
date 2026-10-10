/** UTF-8 byte order follows Unicode scalar order; lone surrogates encode as U+FFFD. */
export function compareUtf8Text(left: string, right: string) {
  let a = 0;
  let b = 0;
  while (a < left.length && b < right.length) {
    const leftPoint = left.codePointAt(a)!;
    const rightPoint = right.codePointAt(b)!;
    const leftScalar = scalar(leftPoint);
    const rightScalar = scalar(rightPoint);
    if (leftScalar !== rightScalar) return leftScalar < rightScalar ? -1 : 1;
    a += leftPoint > 0xffff ? 2 : 1;
    b += rightPoint > 0xffff ? 2 : 1;
  }
  return a < left.length ? 1 : b < right.length ? -1 : 0;
}

function scalar(point: number) {
  return point >= 0xd800 && point <= 0xdfff ? 0xfffd : point;
}

/** Match SQLite's default BINARY collation for TEXT identity keys. */
export function compareSyncIdentityText(left: string, right: string) {
  if (left === right) return 0;
  return compareUtf8Text(left, right) || 1;
}

export function compareSyncIdentityKey(left: { object_type: string; object_id: string },
  right: { object_type: string; object_id: string }) {
  return compareSyncIdentityText(left.object_type, right.object_type) ||
    compareSyncIdentityText(left.object_id, right.object_id);
}
