import { expect, it } from 'vitest';

import { assertSchedulerGradeInput, assertSchedulerGradeResult, assertSchedulerPreviewInput, assertSchedulerPreviewResult } from './contract.js';
import { createLocalReviewSchedulerAdapter } from './localSchedulerAdapter.js';
import { createInitialSchedulerCard } from './types.js';

const valid = '2026-02-28T12:00:00.000Z';

it('rejects impossible dates through the local scheduler adapter', async () => {
  const adapter = createLocalReviewSchedulerAdapter();
  const input = { card: createInitialSchedulerCard(valid), now: '2026-02-30T12:00:00Z', grade: 3 as const };
  await expect(adapter.grade(input)).rejects.toThrow('now');
  await expect(adapter.preview(input)).rejects.toThrow('now');
});

it.each(['2026-02-30T12:00:00.000Z', '2025-02-29T00:00:00Z', '2026-04-31T12:00:00+08:00'])(
  'rejects impossible calendar dates in scheduler requests and results: %s', invalid => {
  const card = createInitialSchedulerCard(valid);
  for (const field of ['now', 'due', 'last_review'] as const) {
    const input = { grade: 3 as const, now: field === 'now' ? invalid : valid,
      card: field === 'now' ? card : { ...card, [field]: invalid } };
    expect(() => assertSchedulerGradeInput(input)).toThrow();
    expect(() => assertSchedulerPreviewInput(input)).toThrow();
  }
  for (const field of ['reviewed_at', 'due', 'last_review'] as const) {
    const result = { reviewed_at: field === 'reviewed_at' ? invalid : valid,
      card: field === 'reviewed_at' ? card : { ...card, [field]: invalid } };
    expect(() => assertSchedulerGradeResult(result)).toThrow();
    expect(() => assertSchedulerPreviewResult({ Again: result, Hard: result, Good: result, Easy: result })).toThrow();
  }
});

it.each(['2024-02-29T23:59:59Z', '2026-02-28T12:00:00.123456+08:00', '2026-03-01T00:30:00-05:00'])(
  'accepts valid leap days, offsets and fractional precision without rewriting input: %s', now => {
  const card = { ...createInitialSchedulerCard(now), last_review: now };
  expect(() => assertSchedulerGradeInput({ grade: 3, card, now })).not.toThrow();
  expect(() => assertSchedulerGradeResult({ card, reviewed_at: now })).not.toThrow();
  expect(card.last_review).toBe(now);
});
