import { FSRS7_DEFAULT_WEIGHTS } from 'ts-fsrs/models/fsrs-7';
import { expect, it } from 'vitest';

import { evaluateReviewTraining } from './trainingEvaluation.js';
import { prepareTrainingHistory, trainingReviewCsv } from './trainingHistory.js';

it('keeps fractional and same-instant reviews, splits resets, and evaluates same-day held-out answers', () => {
  const event = (opId: string, reviewedAt: string, grade = 3) =>
    ({ nodeId: 'card', opId, reviewedAt, grade, kind: 'review' as const });
  const histories = prepareTrainingHistory([
    event('b', '2026-11-01T00:30:00Z'), event('a', '2026-11-01T00:00:00Z'),
    event('c', '2026-11-01T00:30:00Z', 1),
    { ...event('reset', '2026-11-02T00:00:00Z'), kind: 'reset' }, event('d', '2026-11-02T01:00:00Z')
  ]);
  expect([...histories[0]!.deltas]).toEqual([0, 1 / 48, 0]);
  expect([...histories[1]!.deltas]).toEqual([0]);
  expect(trainingReviewCsv(histories, Date.parse('2026-11-01T00:30:00Z'))).not.toContain(String(Date.parse('2026-11-01T00:30:00Z')));
  const metric = evaluateReviewTraining([...FSRS7_DEFAULT_WEIGHTS], histories, Date.parse('2026-11-01T00:30:00Z'));
  expect(metric?.logLoss).toBeGreaterThan(0);
  expect(metric?.rmse).toBeGreaterThan(0);
});
