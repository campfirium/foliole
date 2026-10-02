import { afterEach, expect, it } from 'vitest';

import { createInitialNewItemReviewProfile } from '../../lib/core/review/newItemReviewSlots';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS, hydrateCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import { createNewItemReviewProfiles } from './newItemReviewSlots';

afterEach(() => hydrateCurrentReviewSchedulerSettings(DEFAULT_REVIEW_SCHEDULER_SETTINGS));

it('puts all new items on the next review day when balancing is set to one', () => {
  hydrateCurrentReviewSchedulerSettings({ newItemLoadBalancingDays: 1 });
  const profiles = createNewItemReviewProfiles({
    batchSize: 3, nodesById: {}, now: new Date(2026, 9, 2, 12).toISOString()
  });
  expect(profiles.map((profile) => profile.due)).toEqual(
    Array(3).fill(new Date(2026, 9, 3, 4).toISOString())
  );
});

it('balances by existing load within the selected window without moving existing reviews', () => {
  hydrateCurrentReviewSchedulerSettings({ newItemLoadBalancingDays: 2 });
  const due = new Date(2026, 9, 3, 4).toISOString();
  const nodesById = { existing: { kind: 'item' as const, review: createInitialNewItemReviewProfile(due) } };
  const profiles = createNewItemReviewProfiles({
    batchSize: 3, nodesById, now: new Date(2026, 9, 2, 12).toISOString()
  });
  expect(profiles.map((profile) => profile.due)).toEqual([
    new Date(2026, 9, 4, 4).toISOString(), due, new Date(2026, 9, 4, 4).toISOString()
  ]);
  expect(nodesById.existing.review.due).toBe(due);
});

it('supports a ninety-nine-day window starting after the current review day', () => {
  hydrateCurrentReviewSchedulerSettings({ newItemLoadBalancingDays: 99 });
  const profiles = createNewItemReviewProfiles({
    batchSize: 100, nodesById: {}, now: new Date(2026, 9, 2, 12).toISOString()
  });
  expect(new Set(profiles.map((profile) => profile.due)).size).toBe(99);
  expect(profiles[98]?.due).toBe(new Date(2027, 0, 9, 4).toISOString());
  expect(profiles[99]?.due).toBe(profiles[0]?.due);
});
