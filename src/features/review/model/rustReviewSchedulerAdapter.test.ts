import { describe, expect, it, vi } from 'vitest';

import type { SchedulerGradeInput } from './reviewTypes';
import { createRustReviewSchedulerAdapter } from './rustReviewSchedulerAdapter';

const BASE_INPUT: SchedulerGradeInput = {
  card: {
    due: '2026-02-26T00:00:00.000Z',
    last_review: null,
    state: 0,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0
  },
  grade: 3 as const,
  now: '2026-02-26T00:00:00.000Z'
};

describe('createRustReviewSchedulerAdapter', () => {
  it('invokes review_grade and returns validated response', async () => {
    const invoke = vi.fn().mockResolvedValue({
      card: {
        ...BASE_INPUT.card,
        due: '2026-03-01T00:00:00.000Z',
        last_review: '2026-02-26T00:00:00.000Z',
        reps: 1
      },
      reviewed_at: '2026-02-26T00:00:00.000Z'
    });
    const adapter = createRustReviewSchedulerAdapter(invoke);
    const result = await adapter.grade(BASE_INPUT);
    expect(invoke).toHaveBeenCalledWith('review_grade', {
      request: {
        card: BASE_INPUT.card,
        rating: 'Good',
        now: BASE_INPUT.now
      }
    });
    expect(result.reviewed_at).toBe(BASE_INPUT.now);
  });

  it('throws before invoke when request timestamp is invalid', async () => {
    const invoke = vi.fn();
    const adapter = createRustReviewSchedulerAdapter(invoke);
    await expect(
      adapter.grade({
        ...BASE_INPUT,
        now: 'not-a-timestamp'
      })
    ).rejects.toThrow('now');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('throws when response timestamp is invalid', async () => {
    const invoke = vi.fn().mockResolvedValue({
      card: {
        ...BASE_INPUT.card
      },
      reviewed_at: 'bad'
    });
    const adapter = createRustReviewSchedulerAdapter(invoke);
    await expect(adapter.grade(BASE_INPUT)).rejects.toThrow('reviewed_at');
  });

});

describe('createRustReviewSchedulerAdapter preview', () => {
  it('invokes review_preview and returns validated preview response', async () => {
    const invoke = vi.fn().mockResolvedValue({
      Again: { card: { ...BASE_INPUT.card, due: '2026-02-26T00:10:00.000Z' }, reviewed_at: BASE_INPUT.now },
      Hard: { card: { ...BASE_INPUT.card, due: '2026-02-27T00:00:00.000Z' }, reviewed_at: BASE_INPUT.now },
      Good: { card: { ...BASE_INPUT.card, due: '2026-03-01T00:00:00.000Z' }, reviewed_at: BASE_INPUT.now },
      Easy: { card: { ...BASE_INPUT.card, due: '2026-03-05T00:00:00.000Z' }, reviewed_at: BASE_INPUT.now }
    });
    const adapter = createRustReviewSchedulerAdapter(invoke);
    const result = await adapter.preview({ card: BASE_INPUT.card, now: BASE_INPUT.now });
    expect(invoke).toHaveBeenCalledWith('review_preview', {
      request: {
        card: BASE_INPUT.card,
        now: BASE_INPUT.now
      }
    });
    expect(result.Good.reviewed_at).toBe(BASE_INPUT.now);
  });
});
