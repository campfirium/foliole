import { expect, it } from 'vitest';

import { calendarDateKey, monthLeadingDays, reviewCalendarDayKey, reviewCalendarMonths } from '../../lib/core/review/reviewCalendarDates';
import type { Node } from '../features/nodes/model/nodeTypes';

import { createReadingNode, createReadingProfile, createReviewNode } from './reviewQueuePlanner.test-support';
import { selectReviewCalendarSchedule } from './workspaceReviewCalendar';

function schedule(nodes: Node[]) {
  return selectReviewCalendarSchedule({
    nodesById: Object.fromEntries(nodes.map((node) => [node.id, node])),
    nodeOrder: nodes.map((node) => node.id), trashedNodeIds: [],
    now: new Date(2026, 9, 2, 12).toISOString(), newDayStartsAtHour: 4
  });
}

it('separates Item and Topic due counts and moves overdue work to today', () => {
  const later = new Date(2026, 9, 3, 12).toISOString();
  const days = schedule([
    createReviewNode('item-overdue', new Date(2026, 8, 1, 12).toISOString()),
    createReviewNode('item-later', later),
    createReadingNode('topic-later', later, 'body', createReadingProfile(later)),
    createReadingNode('topic-new', new Date(2026, 8, 1, 12).toISOString())
  ]);
  expect(days['2026-10-02']).toEqual({ day: '2026-10-02', items: 1, topics: 1 });
  expect(days['2026-10-03']).toEqual({ day: '2026-10-03', items: 1, topics: 1 });
  expect(Object.keys(days)).toHaveLength(2);
});

it('counts all scheduled candidates without session mode truncation or expanding future repetitions', () => {
  const later = new Date(2026, 9, 8, 12).toISOString();
  const nodes = Array.from({ length: 120 }, (_, i) => createReadingNode(`topic-${i}`, later));
  expect(schedule(nodes)).toEqual({ '2026-10-08': { day: '2026-10-08', items: 0, topics: 120 } });
});

it('reuses Topic eligibility and excludes dismissed, empty and deleted-ancestor candidates', () => {
  const later = new Date(2026, 9, 8, 12).toISOString();
  const parent = { ...createReadingNode('parent', later), kind: 'folder' as const, deletedAt: later };
  const child = { ...createReadingNode('child', later), parentNodeId: 'parent' };
  expect(schedule([
    parent, child, createReadingNode('empty', later, ''),
    createReadingNode('dismissed', later, 'body', createReadingProfile(later, { state: 'dismissed' }))
  ])).toEqual({});
});

it('follows the review day boundary and generates twelve calendar months across years', () => {
  expect(reviewCalendarDayKey(new Date(2026, 9, 2, 3, 59), 4)).toBe('2026-10-01');
  expect(reviewCalendarDayKey(new Date(2026, 9, 2, 4), 4)).toBe('2026-10-02');
  const months = reviewCalendarMonths(new Date(2026, 11, 2));
  expect(months.map(calendarDateKey)).toHaveLength(12);
  expect(calendarDateKey(months[0]!)).toBe('2026-07-01');
  expect(calendarDateKey(months[11]!)).toBe('2027-06-01');
  expect(monthLeadingDays(new Date(2026, 5, 1))).toBe(0);
  expect(monthLeadingDays(new Date(2028, 1, 1))).toBe(1);
});
