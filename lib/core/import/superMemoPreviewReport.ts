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
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function makeSuperMemoPreviewReport({ rows, referenceDay }: NativeSuperMemoPreview, percent: number) {
  const counts = { folder: 0, topic: 0, item: 0, skipped: 0 };
  const groups = [['1–29', 30], ['30–99', 100], ['100–199', 200], ['200+', Infinity]] as const;
  const intervals = groups.map(([label, limit]) => ({
    label, limit, original: [] as number[], planned: [] as number[], offsets: [] as number[], comparableOriginal: [] as number[]
  }));
  let addedDue = 0;
  let pendingNewItems = 0;
  let deferred = 0;
  let unknownDates = 0;
  let noHistory = 0;
  let sourceDue = 0;
  let totalDue = 0;
  let localImages = 0;
  let remoteImages = 0;
  let unresolvedImages = 0;
  let skippedAudio = 0;
  for (const row of rows) {
    counts[row.outcome]++;
    localImages += row.localImages ?? 0;
    unresolvedImages += (row.unresolvedImages ?? []).reduce((total, image) => total + image.count, 0);
    remoteImages += row.remoteImages ?? 0;
    skippedAudio += row.skippedAudio ?? 0;
    if (row.outcome !== 'item' || row.issue || row.sourceState === 'dismissed') continue;
    if (row.sourceState === 'pending') {
      pendingNewItems++;
      totalDue++;
      continue;
    }
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
    const group = intervals.find(candidate => interval < candidate.limit)!;
    group.original.push(interval);
    const shift = (Date.parse(due) - Date.parse(row.sourceDue)) / 86_400_000;
    group.planned.push(Math.max(0, interval + shift));
    if (row.recalculatedDue) {
      group.offsets.push(shift);
      group.comparableOriginal.push(interval);
    }
  }
  return {
    counts, sourceDue, totalDue, addedDue, pendingNewItems, deferred, unknownDates, noHistory, localImages, unresolvedImages, remoteImages, skippedAudio,
    groups: intervals.filter(group => group.original.length).map(group => ({
      label: group.label, count: group.original.length, source: median(group.original), planned: median(group.planned)
    })),
    shifts: intervals.filter(group => group.offsets.length).map(group => ({
      label: group.label, count: group.offsets.length, source: median(group.comparableOriginal), offset: median(group.offsets)
    })),
    details: rows.filter(row => row.issue || row.historyNeedsReview || row.localImages || row.remoteImages || row.skippedAudio)
  };
}
