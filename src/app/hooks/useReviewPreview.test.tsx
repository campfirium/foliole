import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { NodeReviewProfile } from '../../features/nodes/model/nodeTypes';
import { createReviewSchedulerAdapter } from '../../features/review/model/reviewSchedulerFactory';
import type { ReviewSchedulerAdapter, SchedulerPreviewResult } from '../../features/review/model/reviewTypes';

import { useReviewPreview } from './useReviewPreview';

vi.mock('../../features/review/model/reviewSchedulerFactory', () => ({
  createReviewSchedulerAdapter: vi.fn()
}));

interface HookProps {
  currentNodeId: string | null;
  isAnswerRevealed: boolean;
  isStudyMode: boolean;
  previewSeed: string;
  reviewProfile: NodeReviewProfile | null;
}

const BASE_PROFILE: NodeReviewProfile = {
  due: '2026-03-06T00:00:00.000Z',
  lastReviewAt: null,
  state: 0,
  stability: 0,
  difficulty: 0,
  elapsedDays: 0,
  scheduledDays: 0,
  reps: 0,
  lapses: 0
};

function createPreviewResult(scheduledDays: number): SchedulerPreviewResult {
  const baseCard = {
    due: '2026-03-06T00:00:00.000Z',
    last_review: null,
    state: 0 as const,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: scheduledDays,
    reps: 0,
    lapses: 0
  };
  return {
    Again: { card: baseCard, reviewed_at: '2026-03-06T00:00:00.000Z' },
    Hard: { card: baseCard, reviewed_at: '2026-03-06T00:00:00.000Z' },
    Good: { card: baseCard, reviewed_at: '2026-03-06T00:00:00.000Z' },
    Easy: { card: baseCard, reviewed_at: '2026-03-06T00:00:00.000Z' }
  };
}

function PreviewProbe(props: HookProps) {
  const preview = useReviewPreview(props);
  return <output data-testid="preview-good-days">{preview?.Good.card.scheduled_days ?? 'none'}</output>;
}

function createAdapter(preview: ReviewSchedulerAdapter['preview']): ReviewSchedulerAdapter {
  return {
    preview,
    grade: vi.fn(async () => ({
      card: {
        due: '2026-03-06T00:00:00.000Z',
        last_review: null,
        state: 0 as const,
        stability: 0,
        difficulty: 0,
        elapsed_days: 0,
        scheduled_days: 0,
        reps: 0,
        lapses: 0
      },
      reviewed_at: '2026-03-06T00:00:00.000Z'
    }))
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('requests preview only after answer reveal and avoids duplicate calls for same card signature', async () => {
  const preview = vi.fn<ReviewSchedulerAdapter['preview']>().mockResolvedValue(createPreviewResult(3));
  vi.mocked(createReviewSchedulerAdapter).mockReturnValue(createAdapter(preview));

  const { rerender } = render(
    <PreviewProbe currentNodeId="node-1" isAnswerRevealed={false} isStudyMode previewSeed="0.90" reviewProfile={BASE_PROFILE} />
  );

  expect(preview).not.toHaveBeenCalled();
  expect(screen.getByTestId('preview-good-days')).toHaveTextContent('none');

  rerender(<PreviewProbe currentNodeId="node-1" isAnswerRevealed isStudyMode previewSeed="0.90" reviewProfile={BASE_PROFILE} />);

  await waitFor(() => {
    expect(preview).toHaveBeenCalledTimes(1);
  });
  expect(screen.getByTestId('preview-good-days')).toHaveTextContent('3');

  rerender(<PreviewProbe currentNodeId="node-1" isAnswerRevealed isStudyMode previewSeed="0.90" reviewProfile={BASE_PROFILE} />);

  await waitFor(() => {
    expect(preview).toHaveBeenCalledTimes(1);
  });
});

it('clears stale preview and keeps fallback state when reveal-time preview request fails', async () => {
  const preview = vi
    .fn<ReviewSchedulerAdapter['preview']>()
    .mockResolvedValueOnce(createPreviewResult(7))
    .mockRejectedValueOnce(new Error('preview failed'));
  vi.mocked(createReviewSchedulerAdapter).mockReturnValue(createAdapter(preview));

  const { rerender } = render(
    <PreviewProbe currentNodeId="node-1" isAnswerRevealed isStudyMode previewSeed="0.90" reviewProfile={BASE_PROFILE} />
  );

  await waitFor(() => {
    expect(screen.getByTestId('preview-good-days')).toHaveTextContent('7');
  });
  expect(preview).toHaveBeenCalledTimes(1);

  rerender(
    <PreviewProbe
      currentNodeId="node-1"
      isAnswerRevealed
      isStudyMode
      previewSeed="0.80"
      reviewProfile={{ ...BASE_PROFILE, due: '2026-03-07T00:00:00.000Z' }}
    />
  );

  await waitFor(() => {
    expect(preview).toHaveBeenCalledTimes(2);
  });
  await waitFor(() => {
    expect(screen.getByTestId('preview-good-days')).toHaveTextContent('none');
  });
});

it('requests a fresh preview when scheduler setting signature changes', async () => {
  const preview = vi
    .fn<ReviewSchedulerAdapter['preview']>()
    .mockResolvedValueOnce(createPreviewResult(30))
    .mockResolvedValueOnce(createPreviewResult(12));
  vi.mocked(createReviewSchedulerAdapter).mockReturnValue(createAdapter(preview));

  const { rerender } = render(
    <PreviewProbe currentNodeId="node-1" isAnswerRevealed isStudyMode previewSeed="ts-fsrs@4.3.0|0.90|36500|0|0" reviewProfile={BASE_PROFILE} />
  );

  await waitFor(() => {
    expect(screen.getByTestId('preview-good-days')).toHaveTextContent('30');
  });

  rerender(
    <PreviewProbe currentNodeId="node-1" isAnswerRevealed isStudyMode previewSeed="ts-fsrs@4.3.0|0.90|365|1|0" reviewProfile={BASE_PROFILE} />
  );

  await waitFor(() => {
    expect(preview).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('preview-good-days')).toHaveTextContent('12');
  });
});
