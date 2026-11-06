import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { DailyFlowFutureView } from '../../../lib/core/flow/dailyFlowFuture';
import { installBrowserDailyFlowRuntime } from '../../shared/platform/runtime/dailyFlowBrowserRuntime';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { createQaNode } from '../../store/workspaceStoreReviewActions.test-support';

import { useDailyFlowFuture } from './useDailyFlowFuture';

const now = '2026-11-06T08:00:00.000Z';
const initial = useWorkspaceStore.getState();
const future = vi.fn();
const view: DailyFlowFutureView = { scope: 'a', dayKey: now, now, mode: 'recommended', hasFuture: true,
  dayBuckets: [{ dayOffset: 1, nodeIds: ['topic'] }] };
beforeEach(() => {
  future.mockReset().mockResolvedValue(view);
  installBrowserDailyFlowRuntime({ future } as unknown as NonNullable<ReturnType<typeof import('../../shared/platform/runtime/dailyFlowBrowserRuntime').getBrowserDailyFlowRuntime>>);
  useWorkspaceStore.setState({ libraryScope: 'a', nodesById: { topic: { ...createQaNode('topic', now), content: 'Body' } },
    nodeOrder: ['topic'], trashedNodeIds: [], reviewSessionMode: 'recommended' });
});
afterEach(() => { installBrowserDailyFlowRuntime(null); act(() => useWorkspaceStore.setState(initial, true)); });

it('does not requery for nonempty body edits and retains future entries through a priority refresh', async () => {
  const app = renderHook(() => useDailyFlowFuture(now, true, true));
  await waitFor(() => expect(app.result.current?.view).toEqual(view));
  act(() => useWorkspaceStore.setState(state => ({ nodesById: { ...state.nodesById,
    topic: { ...state.nodesById.topic!, content: 'Edited body', updatedAt: now } } })));
  expect(app.result.current?.view).toEqual(view);
  expect(future).toHaveBeenCalledTimes(1);
  let finish!: (value: DailyFlowFutureView) => void;
  future.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  act(() => useWorkspaceStore.setState(state => ({ nodesById: { ...state.nodesById,
    topic: { ...state.nodesById.topic!, priority: 1 } } })));
  expect(app.result.current?.view).toEqual(view);
  await act(async () => finish({ ...view, hasFuture: false, dayBuckets: [] }));
  expect(app.result.current?.view?.dayBuckets).toEqual([]);
});

it('isolates modes, dates, libraries and disabled demand and rejects old responses', async () => {
  const app = renderHook(({ date, enabled, mode }) => useDailyFlowFuture(date, enabled, true, mode),
    { initialProps: { date: now, enabled: true, mode: 'recommended' as 'recommended' | 'reading-only' } });
  await waitFor(() => expect(app.result.current?.view).toEqual(view));
  let finish!: (value: DailyFlowFutureView) => void;
  future.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  app.rerender({ date: now, enabled: true, mode: 'reading-only' });
  expect(app.result.current).toBeNull();
  app.rerender({ date: '2026-11-07T08:00:00.000Z', enabled: true, mode: 'reading-only' });
  expect(app.result.current).toBeNull();
  act(() => useWorkspaceStore.setState({ libraryScope: 'b' }));
  await act(async () => finish(view));
  expect(app.result.current).toBeNull();
  app.rerender({ date: now, enabled: false, mode: 'reading-only' });
  expect(app.result.current).toBeNull();
});
