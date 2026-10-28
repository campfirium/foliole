import { MaterialInterleaveHeap } from './materialInterleaveHeap.js';

export interface MaterialGroupEntry<T> {
  entry: T;
  source: object;
}

interface Span { start: number; end: number }

function splitBoundaries<T>(long: readonly MaterialGroupEntry<T>[], separatorCount: number) {
  const count = Math.min(separatorCount, long.length - 1);
  const cuts: number[] = [];
  for (let index = 1; index < long.length; index++) {
    if (long[index]!.source === long[index - 1]!.source) cuts.push(index);
  }
  if (cuts.length > count) {
    return Array.from({ length: count }, (_, index) => Math.round((index + 1) * long.length / (count + 1)));
  }
  // Preserve every existing source boundary that needs a separator, then spread
  // the remaining separators by repeatedly bisecting the longest free span.
  const spans = new MaterialInterleaveHeap<Span>((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);
  let start = 0;
  for (const end of [...cuts, long.length]) {
    spans.push({ start, end });
    start = end;
  }
  while (cuts.length < count) {
    const span = spans.pop();
    const middle = Math.floor((span.start + span.end) / 2);
    cuts.push(middle);
    spans.push({ start: span.start, end: middle });
    spans.push({ start: middle, end: span.end });
  }
  return cuts.sort((a, b) => a - b);
}

export function mergeMaterialGroups<T>(left: MaterialGroupEntry<T>[], right: MaterialGroupEntry<T>[]) {
  const [long, short] = left.length >= right.length ? [left, right] : [right, left];
  const cuts = splitBoundaries(long, short.length);
  const result: MaterialGroupEntry<T>[] = [];
  let cursor = 0;
  let separator = 0;
  for (const end of [...cuts, long.length]) {
    while (cursor < end) result.push(long[cursor++]!);
    if (separator < short.length) result.push(short[separator++]!);
  }
  return result;
}
