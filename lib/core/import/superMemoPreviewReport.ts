import type { NativeSuperMemoPreview, NativeSuperMemoPreviewRow } from '../../platform/nativeSuperMemoImportContract.js';

import { blendSuperMemoDue } from './superMemoSchedulePreview.js';

function plannedDue(row: NativeSuperMemoPreviewRow, percent: number) {
  if (row.issue) return null;
  if (row.outcome === 'topic') return row.sourceDue;
  return row.outcome === 'item' ? blendSuperMemoDue(row.sourceDue, row.recalculatedDue, percent) : null;
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function makeSuperMemoPreviewReport({ rows, referenceDay }: NativeSuperMemoPreview, percent: number) {
  const counts = { folder: 0, topic: 0, item: 0, skipped: 0 };
  const groups = [
    { label: '1–29', limit: 30, original: [] as number[], planned: [] as number[] },
    { label: '30–99', limit: 100, original: [] as number[], planned: [] as number[] },
    { label: '100–199', limit: 200, original: [] as number[], planned: [] as number[] },
    { label: '200+', limit: Infinity, original: [] as number[], planned: [] as number[] }
  ];
  let addedDue = 0;
  let deferred = 0;
  let unknownDates = 0;
  let noHistory = 0;
  let sourceDue = 0;
  let totalDue = 0;
  let localImages = 0;
  let remoteImages = 0;
  let skippedAudio = 0;
  for (const row of rows) {
    counts[row.outcome]++;
    localImages += row.localImages ?? 0;
    remoteImages += row.remoteImages ?? 0;
    skippedAudio += row.skippedAudio ?? 0;
    if (row.outcome !== 'item' || row.issue) continue;
    if (!row.historyCount) noHistory++;
    const due = plannedDue(row, percent);
    if (row.sourceDue && row.sourceDue <= referenceDay) sourceDue++;
    if (due && due <= referenceDay) totalDue++;
    if (!row.sourceDue || !row.recalculatedDue || !due) unknownDates++;
    if (!row.sourceDue || !due) continue;
    if (row.sourceDue > referenceDay && due <= referenceDay) addedDue++;
    if (row.sourceDue <= referenceDay && due > referenceDay) deferred++;
    const interval = row.intervalDays;
    if (!interval) continue;
    const group = groups.find(candidate => interval < candidate.limit)!;
    group.original.push(interval);
    group.planned.push(Math.max(0, interval + (Date.parse(due) - Date.parse(row.sourceDue)) / 86_400_000));
  }
  return {
    counts, sourceDue, totalDue, addedDue, deferred, unknownDates, noHistory, localImages, remoteImages, skippedAudio,
    groups: groups.filter(group => group.original.length).map(group => ({
      label: group.label, count: group.original.length, source: median(group.original), planned: median(group.planned)
    })),
    details: rows.filter(row => row.issue || row.historyNeedsReview || row.localImages || row.remoteImages || row.skippedAudio)
  };
}
