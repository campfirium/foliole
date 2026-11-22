import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { useReviewSessionSettingsReplan } from './useReviewSessionSettingsReplan';

// Actions read the current time when they run, so these tests fix the clock instead of passing a time.
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-03-10T12:00:00.000Z')); });
afterEach(() => { vi.useRealTimers(); });

it('replans the active review session after review settings change', () => {
  const setReviewSessionMode = vi.fn();
  const { rerender } = renderHook(
    (props: { currentNodeId: string | null; ready?: boolean; signature: string }) =>
      useReviewSessionSettingsReplan({
        currentNodeId: props.currentNodeId,
        isReviewSchedulerSettingsReady: props.ready ?? true,
        reviewSchedulerSettingsSignature: props.signature,
        reviewSessionMode: 'recommended',
        setReviewSessionMode
      }),
    { initialProps: { currentNodeId: 'qa-1', signature: 'mix=1:5' } }
  );

  expect(setReviewSessionMode).not.toHaveBeenCalled();

  rerender({ currentNodeId: 'qa-1', signature: 'mix=1:2' });

  expect(setReviewSessionMode).toHaveBeenCalledWith('recommended', '2026-03-10T12:00:00.000Z');
});

it('does not replan idle review sessions when settings change', () => {
  const setReviewSessionMode = vi.fn();
  const { rerender } = renderHook(
    (props: { currentNodeId: string | null; signature: string }) =>
      useReviewSessionSettingsReplan({
        currentNodeId: props.currentNodeId,
        isReviewSchedulerSettingsReady: true,
        reviewSchedulerSettingsSignature: props.signature,
        reviewSessionMode: 'recommended',
        setReviewSessionMode
      }),
    { initialProps: { currentNodeId: null, signature: 'mix=1:5' } }
  );

  rerender({ currentNodeId: null, signature: 'mix=1:2' });

  expect(setReviewSessionMode).not.toHaveBeenCalled();
});

it('waits for review scheduler settings ready before replanning a restored session', () => {
  const setReviewSessionMode = vi.fn();
  const { rerender } = renderHook(
    (props: { ready: boolean; signature: string }) =>
      useReviewSessionSettingsReplan({
        currentNodeId: 'qa-1',
        isReviewSchedulerSettingsReady: props.ready,
        reviewSchedulerSettingsSignature: props.signature,
        reviewSessionMode: 'recommended',
        setReviewSessionMode
      }),
    { initialProps: { ready: false, signature: 'mix=1:5' } }
  );

  rerender({ ready: false, signature: 'mix=1:2' });
  expect(setReviewSessionMode).not.toHaveBeenCalled();

  rerender({ ready: true, signature: 'mix=1:2' });
  expect(setReviewSessionMode).toHaveBeenCalledWith('recommended', '2026-03-10T12:00:00.000Z');
  expect(setReviewSessionMode).toHaveBeenCalledTimes(1);
});
