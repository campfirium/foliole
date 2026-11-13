const DAY_MS = 86_400_000;

export function superMemoFullOffset(source: string | null, calculated: string | null) {
  return source && calculated ? (Date.parse(calculated) - Date.parse(source)) / DAY_MS : null;
}

export function adjustSuperMemoDue(lastApplied: string, fullOffset: number | null, oldPercent: number, newPercent: number) {
  if (fullOffset === null) return lastApplied;
  const oldOffset = Math.round(fullOffset * oldPercent / 100);
  const newOffset = Math.round(fullOffset * newPercent / 100);
  return new Date(Date.parse(lastApplied) + (newOffset - oldOffset) * DAY_MS).toISOString().slice(0, 10);
}
