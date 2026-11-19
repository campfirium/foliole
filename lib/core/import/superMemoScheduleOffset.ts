const DAY_MS = 86_400_000;

export function superMemoFullOffset(source: string | null, calculated: string | null) {
  return source && calculated ? (Date.parse(calculated) - Date.parse(source)) / DAY_MS : null;
}

export function roundSuperMemoOffset(fullOffset: number, percent: number) {
  return Math.round(fullOffset * percent / 100);
}

export function adjustSuperMemoDue(lastApplied: string, fullOffset: number | null, oldPercent: number, newPercent: number) {
  if (fullOffset === null) return lastApplied;
  const oldOffset = roundSuperMemoOffset(fullOffset, oldPercent);
  const newOffset = roundSuperMemoOffset(fullOffset, newPercent);
  return new Date(Date.parse(lastApplied) + (newOffset - oldOffset) * DAY_MS).toISOString().slice(0, 10);
}
