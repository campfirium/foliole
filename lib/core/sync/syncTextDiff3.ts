export type SyncTextMergeResult =
  | { kind: 'merged'; text: string }
  | { kind: 'conflict' };

interface TextChange {
  end: number;
  replacement: string[];
  start: number;
}

export function mergeSyncText(base: string, left: string, right: string): SyncTextMergeResult {
  if (left === right) return { kind: 'merged', text: left };
  if (left === base) return { kind: 'merged', text: right };
  if (right === base) return { kind: 'merged', text: left };
  const baseLines = splitLines(base);
  const leftChanges = diffChanges(baseLines, splitLines(left));
  const rightChanges = diffChanges(baseLines, splitLines(right));
  if (hasIncompatibleOverlap(leftChanges, rightChanges)) return { kind: 'conflict' };
  return { kind: 'merged', text: applyChanges(baseLines, dedupeChanges([...leftChanges, ...rightChanges])) };
}

function splitLines(text: string) {
  return text.match(/.*(?:\n|$)/g)?.filter((line) => line.length > 0) ?? [];
}

function diffChanges(base: string[], target: string[]) {
  const matches = longestCommonSubsequence(base, target);
  const changes: TextChange[] = [];
  let baseIndex = 0;
  let targetIndex = 0;
  for (const [nextBase, nextTarget] of [...matches, [base.length, target.length] as const]) {
    if (baseIndex !== nextBase || targetIndex !== nextTarget) {
      changes.push({
        end: nextBase,
        replacement: target.slice(targetIndex, nextTarget),
        start: baseIndex
      });
    }
    baseIndex = nextBase + 1;
    targetIndex = nextTarget + 1;
  }
  return changes;
}

function longestCommonSubsequence(left: string[], right: string[]) {
  const lengths = Array.from({ length: left.length + 1 }, () => Array<number>(right.length + 1).fill(0));
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      lengths[i]![j] = left[i] === right[j]
        ? lengths[i + 1]![j + 1]! + 1
        : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
    }
  }
  const matches: Array<readonly [number, number]> = [];
  for (let i = 0, j = 0; i < left.length && j < right.length;) {
    if (left[i] === right[j]) {
      matches.push([i, j]);
      i += 1;
      j += 1;
    } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return matches;
}

function hasIncompatibleOverlap(left: TextChange[], right: TextChange[]) {
  return left.some((a) => right.some((b) => changesOverlap(a, b) && !sameChange(a, b)));
}

function changesOverlap(left: TextChange, right: TextChange) {
  if (left.start === left.end && right.start === right.end) return left.start === right.start;
  if (left.start === left.end) return left.start > right.start && left.start < right.end;
  if (right.start === right.end) return right.start > left.start && right.start < left.end;
  return left.start < right.end && right.start < left.end;
}

function sameChange(left: TextChange, right: TextChange) {
  return left.start === right.start
    && left.end === right.end
    && left.replacement.join('') === right.replacement.join('');
}

function dedupeChanges(changes: TextChange[]) {
  const unique = new Map<string, TextChange>();
  for (const change of changes) {
    unique.set(`${change.start}:${change.end}:${change.replacement.join('')}`, change);
  }
  return [...unique.values()].sort((a, b) => b.start - a.start || b.end - a.end);
}

function applyChanges(base: string[], changes: TextChange[]) {
  const output = [...base];
  for (const change of changes) {
    output.splice(change.start, change.end - change.start, ...change.replacement);
  }
  return output.join('');
}
