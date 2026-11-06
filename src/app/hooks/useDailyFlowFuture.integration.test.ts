import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import { installBrowserDailyFlowRuntime } from '../../shared/platform/runtime/dailyFlowBrowserRuntime';
import { installWorkspaceBrowserCommit } from '../../store/workspaceBrowserCommit';
import { browserFlow, flowNode, flowNow as now } from '../../store/workspaceBrowserFlow.testSupport';
import { WORKSPACE_STORAGE_KEY } from '../../store/workspaceStore';

import { useDailyFlowFuture } from './useDailyFlowFuture';

afterEach(() => { installWorkspaceBrowserCommit(null); installBrowserDailyFlowRuntime(null); });

it('keeps the same future view through a saved body edit and updates a postponed topic using the browser owner', async () => {
  const tomorrow = new Date(Date.parse(now) + 86400000).toISOString();
  const store = browserFlow([flowNode('future', false, { reading: { nextAt: tomorrow, lastHandledAt: now,
    intervalDurationMs: 60000, intervalGrowthFactor: 1.3, priority: 5, readingPosition: 0, repetitionCount: 1, state: 'active' } })]);
  const app = renderHook(() => useDailyFlowFuture(now, true, true));
  await waitFor(() => expect(app.result.current?.view?.dayBuckets).toEqual([{ dayOffset: 1, nodeIds: ['future'] }]));
  const previous = app.result.current?.view;
  await act(async () => { expect(await store.getState().updateNodeContent('future', 'Saved edited body')).toBe(true); });
  expect(app.result.current?.view).toBe(previous);
  expect(JSON.parse(localStorage.getItem(WORKSPACE_STORAGE_KEY)!).state.nodesById.future.content).toBe('Saved edited body');
  await act(async () => { expect(await store.getState().setReviewTopicDelay('future', 0, now)).toBe(true); });
  await waitFor(() => expect(app.result.current?.view?.dayBuckets).toEqual([]));
  expect(JSON.parse(localStorage.getItem(WORKSPACE_STORAGE_KEY)!).state.nodesById.future.reading.nextAt)
    .toBe(new Date(Date.parse(now) + 60000).toISOString());
});
