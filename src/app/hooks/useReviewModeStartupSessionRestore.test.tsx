import { renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import {
  useReviewModeRestoredSessionAutoOpen,
  useReviewModeStartupSessionRestore
} from './useReviewModeStartupSessionRestore';

function renderAutoOpenHook(overrides: Partial<Parameters<typeof useReviewModeRestoredSessionAutoOpen>[0]> = {}) {
  const props = {
    isReviewSessionCompleted: false,
    isStudyMode: false,
    isWorkspaceHydrated: true,
    reviewCurrentNodeId: 'review-1',
    startStudyMode: vi.fn(),
    ...overrides
  };
  renderHook(() => useReviewModeRestoredSessionAutoOpen(props));
  return props;
}

it('opens Flow once when a hydrated session has a current review item', () => {
  const props = renderAutoOpenHook();

  expect(props.startStudyMode).toHaveBeenCalledWith({ force: true });
  expect(props.startStudyMode).toHaveBeenCalledTimes(1);
});

it('opens Flow once when a hydrated session is completed', () => {
  const props = renderAutoOpenHook({
    isReviewSessionCompleted: true,
    reviewCurrentNodeId: null
  });

  expect(props.startStudyMode).toHaveBeenCalledWith({ force: true });
  expect(props.startStudyMode).toHaveBeenCalledTimes(1);
});

it('does not open Flow without a restored session', () => {
  const props = renderAutoOpenHook({ reviewCurrentNodeId: null });

  expect(props.startStudyMode).not.toHaveBeenCalled();
});

it('does not repeat restored Flow auto open across rerenders', () => {
  const props = {
    isReviewSessionCompleted: false,
    isStudyMode: false,
    isWorkspaceHydrated: true,
    reviewCurrentNodeId: 'review-1',
    startStudyMode: vi.fn()
  };
  const view = renderHook((hookProps) => useReviewModeRestoredSessionAutoOpen(hookProps), {
    initialProps: props
  });

  view.rerender({ ...props });

  expect(props.startStudyMode).toHaveBeenCalledTimes(1);
});

function renderRestoreHook(overrides: Partial<Parameters<typeof useReviewModeStartupSessionRestore>[0]> = {}) {
  const props = {
    activeNodeId: 'topic-1',
    isReviewSessionCompleted: false,
    isStudyMode: true,
    isWorkspaceHydrated: true,
    onReviewSessionStarted: vi.fn(),
    resumeReviewSession: vi.fn(() => false),
    reviewCurrentNodeId: 'review-1',
    startReviewSession: vi.fn(() => true),
    ...overrides
  };
  renderHook(() => useReviewModeStartupSessionRestore(props));
  return props;
}

it('resumes the review session when restored Flow opens away from the current item', () => {
  const props = renderRestoreHook();

  expect(props.resumeReviewSession).toHaveBeenCalledTimes(1);
  expect(props.onReviewSessionStarted).toHaveBeenCalledTimes(1);
  expect(props.startReviewSession).not.toHaveBeenCalled();
});

it('starts a review session when restored Flow has no current session to resume', () => {
  const props = renderRestoreHook({ reviewCurrentNodeId: null });

  expect(props.resumeReviewSession).toHaveBeenCalledTimes(1);
  expect(props.onReviewSessionStarted).toHaveBeenCalledTimes(1);
  expect(props.startReviewSession).toHaveBeenCalledTimes(1);
});

it('does not replace an already completed restored Flow session', () => {
  const props = renderRestoreHook({
    isReviewSessionCompleted: true,
    reviewCurrentNodeId: null
  });

  expect(props.resumeReviewSession).toHaveBeenCalledTimes(1);
  expect(props.onReviewSessionStarted).toHaveBeenCalledTimes(1);
  expect(props.startReviewSession).not.toHaveBeenCalled();
});

it('opens the review surface once when the restored current review item is already active', () => {
  const props = renderRestoreHook({ activeNodeId: 'review-1' });

  expect(props.onReviewSessionStarted).toHaveBeenCalledTimes(1);
  expect(props.resumeReviewSession).not.toHaveBeenCalled();
  expect(props.startReviewSession).not.toHaveBeenCalled();
});

it('does not repeat the review surface startup action while restored Flow stays open', () => {
  const props = {
    activeNodeId: 'review-1',
    isReviewSessionCompleted: false,
    isStudyMode: true,
    isWorkspaceHydrated: true,
    onReviewSessionStarted: vi.fn(),
    resumeReviewSession: vi.fn(() => false),
    reviewCurrentNodeId: 'review-1',
    startReviewSession: vi.fn(() => true)
  };
  const view = renderHook((hookProps) => useReviewModeStartupSessionRestore(hookProps), {
    initialProps: props
  });

  view.rerender({ ...props, activeNodeId: 'review-2' });

  expect(props.onReviewSessionStarted).toHaveBeenCalledTimes(1);
  expect(props.resumeReviewSession).not.toHaveBeenCalled();
});
