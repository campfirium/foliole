export type WholeLibraryWorkKind = 'full-read' | 'full-refresh';

// Only the most recent marks matter: a slow operation counts the marks inside its own span.
const capacity = 64;
const marks: { kind: WholeLibraryWorkKind; at: number }[] = [];

/** Marks one pass over the whole library; costs one array push so it can sit on the read path itself. */
export function markWholeLibraryWork(kind: WholeLibraryWorkKind) {
  if (marks.length === capacity) marks.shift();
  marks.push({ kind, at: performance.now() });
}

export function countWholeLibraryWork(kind: WholeLibraryWorkKind, fromMs: number, toMs: number) {
  let count = 0;
  for (const mark of marks) if (mark.kind === kind && mark.at >= fromMs && mark.at <= toMs) count += 1;
  return count;
}

export function resetWholeLibraryWorkForTests() {
  marks.length = 0;
}
