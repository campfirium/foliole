import { expect, it, vi } from 'vitest';

import { enterReviewModeSession, toggleReviewModeSession } from './reviewModeSessionActions';

it('opens study mode after a review session starts', () => {
  const onReviewSessionStarted = vi.fn();
  const startStudyMode = vi.fn();

  const started = enterReviewModeSession({
    onReviewSessionStarted,
    startReviewSession: () => true,
    startStudyMode
  });

  expect(started).toBe(true);
  expect(onReviewSessionStarted).toHaveBeenCalledTimes(1);
  expect(onReviewSessionStarted.mock.invocationCallOrder[0]!).toBeLessThan(startStudyMode.mock.invocationCallOrder[0]!);
  expect(startStudyMode).toHaveBeenCalledWith({ force: true });
});

it('does not open study mode when the review queue is empty', () => {
  const onReviewQueueEmpty = vi.fn();
  const onReviewSessionStarted = vi.fn();
  const startStudyMode = vi.fn();

  const started = enterReviewModeSession({
    onReviewQueueEmpty,
    onReviewSessionStarted,
    startReviewSession: () => false,
    startStudyMode
  });

  expect(started).toBe(false);
  expect(onReviewQueueEmpty).toHaveBeenCalledTimes(1);
  expect(onReviewSessionStarted).not.toHaveBeenCalled();
  expect(startStudyMode).not.toHaveBeenCalled();
});

it('exits both review session and study mode when already reviewing', () => {
  const exitReviewSession = vi.fn();
  const exitStudyMode = vi.fn();

  const handled = toggleReviewModeSession(true, {
    exitReviewSession,
    exitStudyMode,
    startReviewSession: vi.fn(),
    startStudyMode: vi.fn()
  });

  expect(handled).toBe(true);
  expect(exitReviewSession).toHaveBeenCalledTimes(1);
  expect(exitStudyMode).toHaveBeenCalledTimes(1);
});
