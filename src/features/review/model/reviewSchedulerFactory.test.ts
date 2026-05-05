import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getRuntimeInvoke } from '../../../shared/platform/bridge';

import { createReviewSchedulerAdapter } from './reviewSchedulerFactory';

vi.mock('../../../shared/platform/bridge', () => ({
  getRuntimeInvoke: vi.fn()
}));

const BASE_CARD = {
  due: '2026-02-26T00:00:00.000Z',
  last_review: null,
  state: 0,
  stability: 0,
  difficulty: 0,
  elapsed_days: 0,
  scheduled_days: 0,
  reps: 0,
  lapses: 0
} as const;

describe('createReviewSchedulerAdapter', () => {
  beforeEach(() => {
    vi.mocked(getRuntimeInvoke).mockReset();
  });

  it('falls back to local scheduler when tauri invoke is unavailable', async () => {
    vi.mocked(getRuntimeInvoke).mockReturnValue(null);
    const adapter = createReviewSchedulerAdapter();
    const result = await adapter.grade({
      card: { ...BASE_CARD },
      grade: 3,
      now: '2026-02-26T00:00:00.000Z'
    });
    expect(result.card.reps).toBe(1);
    expect(result.reviewed_at).toBe('2026-02-26T00:00:00.000Z');

    const preview = await adapter.preview({
      card: { ...BASE_CARD },
      now: '2026-02-26T00:00:00.000Z'
    });
    expect(preview.Good.card.scheduled_days).toBe(3);
  });

  it('throws when rust-only mode is set and tauri invoke is unavailable', async () => {
    vi.mocked(getRuntimeInvoke).mockReturnValue(null);
    const adapter = createReviewSchedulerAdapter('rust-only');

    await expect(
      adapter.grade({
        card: { ...BASE_CARD },
        grade: 3,
        now: '2026-02-26T00:00:00.000Z'
      })
    ).rejects.toThrow('Rust scheduler is required');
  });

  it('uses tauri invoke when available', async () => {
    const invoke = vi.fn().mockResolvedValue({
      card: { ...BASE_CARD, reps: 9 },
      reviewed_at: '2026-02-26T00:00:00.000Z'
    });
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    const adapter = createReviewSchedulerAdapter('rust-only');
    const result = await adapter.grade({
      card: { ...BASE_CARD },
      grade: 4,
      now: '2026-02-26T00:00:00.000Z'
    });

    expect(invoke).toHaveBeenCalledWith('review_grade', {
      request: {
        card: { ...BASE_CARD },
        rating: 'Easy',
        now: '2026-02-26T00:00:00.000Z'
      }
    });
    expect(result.card.reps).toBe(9);
  });
});
