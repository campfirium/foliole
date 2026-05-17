import { expect, it, vi } from 'vitest';

import { enterReviewModeSession, toggleReviewModeSession } from './reviewModeSessionActions';

it('opens study mode after a review session starts', () => {
  const startStudyMode = vi.fn();

  const started = enterReviewModeSession({
    startReviewSession: () => true,
    startStudyMode
  });

  expect(started).toBe(true);
  expect(startStudyMode).toHaveBeenCalledWith({ force: true });
});

it('does not open study mode when the review queue is empty', () => {
  const startStudyMode = vi.fn();

  const started = enterReviewModeSession({
    startReviewSession: () => false,
    startStudyMode
  });

  expect(started).toBe(false);
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
