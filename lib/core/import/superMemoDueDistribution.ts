import type { NativeSuperMemoPreview } from '../../platform/nativeSuperMemoImportContract.js';

import { roundSuperMemoOffset } from './superMemoScheduleOffset.js';
import { sourceDay } from './superMemoSchedulePreview.js';

const DAY_MS = 86_400_000;
const DAYS_PER_WEEK = 7;
const EPOCH_WEEK_OFFSET = 3; // The Unix epoch started on a Thursday.

type ReviewDates = { sourceDay: number; adjustment: number };
export type SuperMemoDueDistribution = ReturnType<typeof prepareSuperMemoDueDistribution>;
export type SuperMemoDueProjection = ReturnType<typeof countSchedule>;

function calendarWeek(day: number) {
  return Math.floor((day + EPOCH_WEEK_OFFSET) / DAYS_PER_WEEK);
}

function countSchedule(dates: ReviewDates[], percent: number, referenceDay: number) {
  const counts = new Map<number, number>();
  let peak = 0;
  let dueCount = 0;
  for (const { sourceDay, adjustment } of dates) {
    const due = sourceDay + roundSuperMemoOffset(adjustment, percent);
    if (due <= referenceDay) {
      dueCount += 1;
      continue;
    }
    const week = calendarWeek(due);
    const count = (counts.get(week) ?? 0) + 1;
    counts.set(week, count);
    peak = Math.max(peak, count);
  }
  return { counts, peak, dueCount };
}

function asDate(day: number) {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export function superMemoDueWeekDates(week: number) {
  const start = week * DAYS_PER_WEEK - EPOCH_WEEK_OFFSET;
  return { start: asDate(start), end: asDate(start + DAYS_PER_WEEK - 1) };
}

export function prepareSuperMemoDueDistribution({ rows, referenceDay }: Pick<NativeSuperMemoPreview, 'rows' | 'referenceDay'>) {
  const referenceOrdinal = Date.parse(referenceDay) / DAY_MS;
  const firstFutureDay = referenceOrdinal + 1;
  const dates: ReviewDates[] = [];
  let lastDay = -Infinity;
  let retainedSourceCount = 0;
  let excludedCount = 0;
  for (const row of rows) {
    if (row.outcome !== 'item' || row.issue || row.sourceState === 'pending' || row.sourceState === 'dismissed') continue;
    const lastReview = sourceDay(row.lastRepetition);
    const source = row.sourceDue ? Date.parse(row.sourceDue) : NaN;
    const recalculated = row.recalculatedDue ? Date.parse(row.recalculatedDue) : source;
    if (lastReview === null || !Number.isFinite(source) || !Number.isFinite(recalculated)
        || source < lastReview || recalculated < lastReview) {
      excludedCount += 1;
      continue;
    }
    if (!row.recalculatedDue) retainedSourceCount += 1;
    const sourceOrdinal = source / DAY_MS;
    const recalculatedOrdinal = recalculated / DAY_MS;
    dates.push({ sourceDay: sourceOrdinal, adjustment: recalculatedOrdinal - sourceOrdinal });
    lastDay = Math.max(lastDay, sourceOrdinal, recalculatedOrdinal);
  }

  const baseline = countSchedule(dates, 0, referenceOrdinal);
  let maxCount = baseline.peak;
  const occupiedWeeks = new Set(baseline.counts.keys());
  for (let percent = 1; percent <= 100; percent++) {
    const { counts, peak } = countSchedule(dates, percent, referenceOrdinal);
    for (const week of counts.keys()) occupiedWeeks.add(week);
    maxCount = Math.max(maxCount, peak);
  }
  return {
    firstWeek: calendarWeek(firstFutureDay), lastWeek: calendarWeek(lastDay), maxCount, occupiedWeeks,
    retainedSourceCount, excludedCount,
    startDate: asDate(firstFutureDay), referenceDay,
    scheduledCount: dates.length,
    original: baseline,
    planned: (percent: number) => percent === 0 ? baseline : countSchedule(dates, percent, referenceOrdinal)
  };
}
