import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { installDemoRuntimeController, type DemoRuntimeController, type DemoRuntimeState } from '../../shared/platform/runtime/demoRuntime';
import type { ReviewFlowWindow } from '../../store/workspaceReviewFlowWindow';
import type { WorkspaceLayoutProps } from '../components/workspaceLayoutGroupedProps';

import {
  bindReviewQueueEmptyDialogToLayoutProps,
  useReviewQueueEmptyDialogState
} from './useReviewQueueEmptyDialogState';

function createFlowWindow(overrides: Partial<ReviewFlowWindow>): ReviewFlowWindow {
  return {
    dayBuckets: [],
    dayOffsetByNodeId: {},
    queueNodeIds: [],
    readyNodeIds: [],
    upcomingNodeIds: [],
    ...overrides
  };
}

function installDemoState(stateOverrides: Partial<DemoRuntimeState>) {
  const state: DemoRuntimeState = {
    clearError: null,
    importError: null,
    importedTopicCount: 0,
    isDemo: false,
    manualAdvanceDays: 0,
    previewDay: 0,
    startedAt: null,
    ...stateOverrides
  };
  installDemoRuntimeController({
    clearLocalData: () => Promise.resolve(false),
    continueToNextPreviewDay: () => undefined,
    getNowIso: (realNow) => realNow.toISOString(),
    getState: () => state,
    importMarkdown: () => Promise.resolve({ ignoredCount: 0, importedTopicCount: 0 }),
    subscribe: () => () => undefined
  } satisfies DemoRuntimeController);
}

it('reopens the Demo day-clear dialog when the empty Flow action is clicked again', () => {
  installDemoState({ isDemo: true, previewDay: 0 });
  const flowWindow = createFlowWindow({
    dayBuckets: [{ dayOffset: 1, nodeIds: ['day-2-topic'] }],
    dayOffsetByNodeId: { 'day-2-topic': 1 },
    upcomingNodeIds: ['day-2-topic']
  });
  const { result } = renderHook(() => useReviewQueueEmptyDialogState(flowWindow));

  act(() => result.current.close());
  expect(result.current.content).toBeNull();

  act(() => result.current.openEmpty());

  expect(result.current.content).toEqual({ day: 1, kind: 'demo-day-clear' });
});

it('opens the Demo day-clear dialog before starting a scheduled fallback session', () => {
  installDemoState({ isDemo: true, previewDay: 0 });
  const flowWindow = createFlowWindow({
    dayBuckets: [{ dayOffset: 1, nodeIds: ['day-2-topic'] }],
    dayOffsetByNodeId: { 'day-2-topic': 1 },
    upcomingNodeIds: ['day-2-topic']
  });
  const startReviewSession = vi.fn(() => true);
  const { result } = renderHook(() => useReviewQueueEmptyDialogState(flowWindow));
  const layoutProps = {
    review: {
      onStartStudyMode: startReviewSession,
      onToggleReviewSession: startReviewSession
    }
  } as unknown as WorkspaceLayoutProps;
  const bound = bindReviewQueueEmptyDialogToLayoutProps(
    layoutProps,
    result.current.openEmpty,
    result.current.shouldOpenBeforeStart
  );

  act(() => {
    expect(bound.review.onToggleReviewSession()).toBe(false);
  });

  expect(startReviewSession).not.toHaveBeenCalled();
  expect(result.current.content).toEqual({ day: 1, kind: 'demo-day-clear' });
});

it('does not open Demo day-clear while the current Flow surface is still active', () => {
  installDemoState({ isDemo: true, previewDay: 0 });
  const flowWindow = createFlowWindow({
    dayBuckets: [{ dayOffset: 1, nodeIds: ['day-2-topic'] }],
    dayOffsetByNodeId: { 'day-2-topic': 1 },
    upcomingNodeIds: ['day-2-topic']
  });
  const { result } = renderHook(() =>
    useReviewQueueEmptyDialogState(flowWindow, { allowDemoDayClear: false })
  );

  expect(result.current.content).toBeNull();
  expect(result.current.shouldOpenBeforeStart).toBe(false);

  act(() => result.current.openEmpty());

  expect(result.current.content).toEqual({ kind: 'empty' });
});

it('opens Demo day-clear for a completed Flow even while study mode is active', () => {
  installDemoState({ isDemo: true, previewDay: 0 });
  const flowWindow = createFlowWindow({
    dayBuckets: [{ dayOffset: 1, nodeIds: ['day-2-topic'] }],
    dayOffsetByNodeId: { 'day-2-topic': 1 },
    upcomingNodeIds: ['day-2-topic']
  });
  const { result } = renderHook(() =>
    useReviewQueueEmptyDialogState(flowWindow, { allowDemoDayClear: false })
  );

  act(() => result.current.openClear());

  expect(result.current.content).toEqual({ day: 1, kind: 'demo-day-clear' });
});

it('does not reopen the same Demo day-clear after the completed Flow dialog is closed', () => {
  installDemoState({ isDemo: true, previewDay: 0 });
  const flowWindow = createFlowWindow({
    dayBuckets: [{ dayOffset: 1, nodeIds: ['day-2-topic'] }],
    dayOffsetByNodeId: { 'day-2-topic': 1 },
    upcomingNodeIds: ['day-2-topic']
  });
  let allowDemoDayClear = false;
  const { result, rerender } = renderHook(() =>
    useReviewQueueEmptyDialogState(flowWindow, { allowDemoDayClear })
  );

  act(() => result.current.openClear());
  act(() => result.current.close());
  allowDemoDayClear = true;
  rerender();

  expect(result.current.content).toBeNull();
});

it('keeps the normal all-clear dialog outside Demo day-clear state', () => {
  installDemoState({ isDemo: false, previewDay: 0 });
  const flowWindow = createFlowWindow({});
  const { result } = renderHook(() => useReviewQueueEmptyDialogState(flowWindow));

  act(() => result.current.openEmpty());

  expect(result.current.content).toEqual({ kind: 'empty' });
});
