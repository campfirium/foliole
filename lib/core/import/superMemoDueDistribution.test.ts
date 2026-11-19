import { expect, it } from 'vitest';

import type { NativeSuperMemoPreviewRow } from '../../platform/nativeSuperMemoImportContract.js';

import { prepareSuperMemoDueDistribution, superMemoDueWeekDates } from './superMemoDueDistribution.js';
import { blendSuperMemoDue } from './superMemoSchedulePreview.js';

const referenceDay = '2025-01-31';
const row: NativeSuperMemoPreviewRow = {
  id: 1, parentId: null, sourceType: 'Item', title: 'Card', outcome: 'item', issue: null, intervalDays: 30,
  lastRepetition: '01.01.2025', historyCount: 1, sourceDue: '2025-01-31', recalculatedDue: '2025-01-19',
  replayedCount: 1, historyNeedsReview: false
};

function countsByWeek(counts: ReadonlyMap<number, number>) {
  return new Map([...counts].map(([week, count]) => [superMemoDueWeekDates(week).start, count]));
}

it('keeps a large backlog outside the future scale and retains dates more than a year away', () => {
  const backlog = Array.from({ length: 1700 }, (_, i) => ({ ...row, id: i + 1 }));
  const long = { ...row, id: 1701, sourceDue: '2027-01-31', recalculatedDue: '2026-12-19' };
  const distribution = prepareSuperMemoDueDistribution({ rows: [...backlog, long], referenceDay });
  expect(distribution).toMatchObject({ startDate: '2025-02-01', maxCount: 1, scheduledCount: 1701 });
  expect(distribution.original.dueCount).toBe(1700);
  expect(countsByWeek(distribution.original.counts)).toEqual(new Map([['2027-01-25', 1]]));
  expect(distribution.planned(100).dueCount).toBe(1700);
  expect(countsByWeek(distribution.planned(100).counts)).toEqual(new Map([['2026-12-14', 1]]));
  expect(superMemoDueWeekDates(distribution.lastWeek).end).toBe('2027-01-31');
});

it('uses the blended date to move cards between already due and the future chart', () => {
  const earlier = { ...row, sourceDue: '2025-02-01', recalculatedDue: '2025-01-31' };
  const later = { ...row, id: 2, sourceDue: '2025-01-31', recalculatedDue: '2025-03-01' };
  const distribution = prepareSuperMemoDueDistribution({ rows: [earlier, later], referenceDay });
  expect(distribution.original.dueCount).toBe(1);
  expect(distribution.planned(0)).toEqual(distribution.original);
  for (let percent = 0; percent <= 100; percent++) {
    const dates = [earlier, later].map(item => blendSuperMemoDue(item.sourceDue, item.recalculatedDue, percent)!);
    const expectedWeeks = new Map<string, number>();
    for (const date of dates.filter(value => value > referenceDay)) {
      const monday = new Date(date);
      monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
      const week = monday.toISOString().slice(0, 10);
      expectedWeeks.set(week, (expectedWeeks.get(week) ?? 0) + 1);
    }
    const planned = distribution.planned(percent);
    expect(countsByWeek(planned.counts)).toEqual(expectedWeeks);
    expect(planned.dueCount).toBe(dates.filter(value => value <= referenceDay).length);
  }
});

it('shows a due count with no future bars when every scheduled date has passed', () => {
  const distribution = prepareSuperMemoDueDistribution({
    rows: [{ ...row, recalculatedDue: null }], referenceDay
  });
  expect(distribution).toMatchObject({ retainedSourceCount: 1, scheduledCount: 1, maxCount: 0 });
  expect(distribution.original).toMatchObject({ dueCount: 1, counts: new Map() });
  expect(distribution.planned(100)).toEqual(distribution.original);
});

it('compares the same cohort and reports cards without a usable anchor or original date', () => {
  const distribution = prepareSuperMemoDueDistribution({ referenceDay, rows: [
    { ...row, recalculatedDue: '2025-02-01' },
    { ...row, id: 2, lastRepetition: null },
    { ...row, id: 3, sourceDue: null },
    { ...row, id: 4, recalculatedDue: '2024-12-31' },
    { ...row, id: 5, sourceState: 'pending' },
    { ...row, id: 6, sourceState: 'dismissed' },
    { ...row, id: 7, outcome: 'topic' },
    { ...row, id: 8, issue: 'missing-question' }
  ] });
  expect(distribution).toMatchObject({ scheduledCount: 1, excludedCount: 3, retainedSourceCount: 0 });
  expect(distribution.original).toMatchObject({ dueCount: 1, counts: new Map() });
  expect(countsByWeek(distribution.planned(100).counts)).toEqual(new Map([['2025-01-27', 1]]));
  expect(distribution.planned(100).dueCount).toBe(0);
});

it('groups future reviews in Monday–Sunday weeks even when the first week crosses a month', () => {
  const dates = ['2025-01-31', '2025-02-01', '2025-02-02', '2025-02-03'];
  const distribution = prepareSuperMemoDueDistribution({
    referenceDay,
    rows: dates.map((sourceDue, id) => ({ ...row, id, sourceDue, recalculatedDue: '2025-02-03' }))
  });
  expect(distribution.original.dueCount).toBe(1);
  expect(countsByWeek(distribution.original.counts)).toEqual(new Map([['2025-01-27', 2], ['2025-02-03', 1]]));
  expect(distribution.planned(100).dueCount).toBe(0);
  expect(countsByWeek(distribution.planned(100).counts)).toEqual(new Map([['2025-02-03', 4]]));
});
