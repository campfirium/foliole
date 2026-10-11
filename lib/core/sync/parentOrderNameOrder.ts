import { compareUtf8Text } from './syncIdentityKeyOrder.js';

function parts(value: string) {
  return value.normalize('NFKC').toLowerCase().match(/[0-9]+|[^0-9]+/gu) ?? [];
}

function comparePart(left: string, right: string) {
  if (/^[0-9]+$/u.test(left) && /^[0-9]+$/u.test(right)) {
    const a = left.replace(/^0+(?=\d)/u, '');
    const b = right.replace(/^0+(?=\d)/u, '');
    return a.length - b.length || compareUtf8Text(a, b);
  }
  return compareUtf8Text(left, right);
}

/** Uses Unicode scalar and numeric order without a host ICU or locale dependency. */
export function compareParentOrderNames(left: { id: string; title: string },
  right: { id: string; title: string }) {
  const a = parts(left.title);
  const b = parts(right.title);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = comparePart(a[index]!, b[index]!);
    if (difference) return difference;
  }
  return a.length - b.length || compareUtf8Text(left.id, right.id);
}
