// @vitest-environment node
import { expect, it } from 'vitest';

import { createFsrsReviewScheduler } from '../../lib/core/review/fsrsScheduler.js';
import { createReviewSchedulerParameters, DEFAULT_REVIEW_SCHEDULER_SETTINGS, getReviewSchedulerVersion } from '../../lib/core/review/settings.js';
import { createInitialSchedulerCard } from '../../lib/core/review/types.js';

import { parseReviewGradeArgs, parseReviewPreviewArgs } from './commandParserReview.js';

const now = '2026-10-26T08:00:00.000Z';
const card = createInitialSchedulerCard(now);

it('preserves retention through native grade and preview requests, including scheduler cache changes', () => {
  const scheduler = createFsrsReviewScheduler({ loadSettings: () => DEFAULT_REVIEW_SCHEDULER_SETTINGS,
    getSettingsVersion: getReviewSchedulerVersion, createParameters: createReviewSchedulerParameters });
  const results = [0.8, 0.99, 0.8].map(desiredRetention => {
    const request = { card, now, rating: 'Good', desiredRetention };
    const grade = parseReviewGradeArgs({ request }).request;
    const preview = parseReviewPreviewArgs({ request }).request;
    expect(grade.desiredRetention).toBe(desiredRetention);
    expect(preview.desiredRetention).toBe(desiredRetention);
    expect(scheduler.grade(grade)).toEqual(scheduler.preview(preview).Good);
    return scheduler.grade(grade).card;
  });
  expect(results[0]).toEqual(results[2]);
  expect(Date.parse(results[0]!.due)).toBeGreaterThan(Date.parse(results[1]!.due));
});

it.each([0, 1, -0.5, NaN, Infinity, '0.9', null])('rejects invalid retention at the native boundary: %s', desiredRetention => {
  const request = { card, now, rating: 'Good', desiredRetention };
  expect(() => parseReviewGradeArgs({ request })).toThrow('request.desiredRetention');
  expect(() => parseReviewPreviewArgs({ request })).toThrow('request.desiredRetention');
});
