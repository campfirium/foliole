export interface SourceUpdateAlignedRow {
  currentLine: string | null;
  updatedLine: string | null;
}

const MAX_FUZZY_DP_CELLS = 20_000;
const MAX_FUZZY_CHARACTER_WORK = 1_500_000;

export function shouldUseFuzzyLineAlignment(currentLines: string[], updatedLines: string[]) {
  const cells = (currentLines.length + 1) * (updatedLines.length + 1);
  const currentCharacters = currentLines.reduce((total, line) => total + line.length, 0);
  const updatedCharacters = updatedLines.reduce((total, line) => total + line.length, 0);
  const characterWork = currentCharacters * updatedLines.length
    + updatedCharacters * currentLines.length;
  return cells <= MAX_FUZZY_DP_CELLS && characterWork <= MAX_FUZZY_CHARACTER_WORK;
}

function buildUpdatedLineIndexes(lines: string[]) {
  const indexes = new Map<string, number[]>();
  lines.forEach((line, index) => {
    const matches = indexes.get(line) ?? [];
    matches.push(index);
    indexes.set(line, matches);
  });
  return indexes;
}

function findNextIndex(indexes: number[] | undefined, minimum: number) {
  if (!indexes) return null;
  let low = 0;
  let high = indexes.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((indexes[middle] ?? -1) < minimum) low = middle + 1;
    else high = middle;
  }
  return indexes[low] ?? null;
}

export function buildExactAnchorFallbackRows(currentLines: string[], updatedLines: string[]) {
  const rows: SourceUpdateAlignedRow[] = [];
  const updatedLineIndexes = buildUpdatedLineIndexes(updatedLines);
  let updatedIndex = 0;

  currentLines.forEach((currentLine) => {
    const matchingIndex = findNextIndex(updatedLineIndexes.get(currentLine), updatedIndex);
    if (matchingIndex === null) {
      rows.push({ currentLine, updatedLine: null });
      return;
    }
    while (updatedIndex < matchingIndex) {
      rows.push({ currentLine: null, updatedLine: updatedLines[updatedIndex] ?? '' });
      updatedIndex += 1;
    }
    rows.push({ currentLine, updatedLine: updatedLines[updatedIndex] ?? '' });
    updatedIndex += 1;
  });

  while (updatedIndex < updatedLines.length) {
    rows.push({ currentLine: null, updatedLine: updatedLines[updatedIndex] ?? '' });
    updatedIndex += 1;
  }
  return rows;
}
