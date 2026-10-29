import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { useReviewTopicDelayPanel } from './useReviewTopicDelayPanel';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('../../shared/platform/runtimeInvoke', async importOriginal => ({
  ...await importOriginal<typeof import('../../shared/platform/runtimeInvoke')>(),
  getRuntimeInvoke: () => invoke, isRuntimeInvokeAvailable: () => true
}));
vi.mock('../../shared/ui/AppRuntimeNotice', () => ({ showAppRuntimeNotice: vi.fn() }));
const now = '2026-10-29T01:00:00.000Z';
const reading = { intervalDurationMs: 1209600000, intervalGrowthFactor: 1.7, lastHandledAt: now, nextAt: now,
  priority: 3, readingPosition: 27, repetitionCount: 9, state: 'active' as const };
const node: Node = { id: 'a', kind: 'topic', parentNodeId: null, title: 'A', content: 'Body', reveal: null,
  reading: null, review: null, createdAt: now, updatedAt: now };
function setup() {
  const ws = { activeNodeId: 'a', nodesById: { a: node }, trashedNodeIds: [], setReviewTopicDelay: vi.fn(async () => true) };
  return { ws, ...renderHook(() => useReviewTopicDelayPanel({ ws })) };
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(now));
  invoke.mockReset();
  vi.mocked(showAppRuntimeNotice).mockClear();
  useWorkspaceStore.setState({ libraryScope: 'library-a' });
});
afterEach(() => vi.useRealTimers());

it('loads the database date on opening and submits its exact reading without filling workspace memory', async () => {
  let finish: (value: unknown) => void = () => {};
  invoke.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const app = setup();
  act(() => { app.result.current.open();
    app.result.current.setSelectedLevel(0); });
  expect(app.result.current.isOpen).toBe(true);
  expect(app.result.current.dueDateLabel).toBe('…');
  expect(await app.result.current.submit(0)).toBe(false);
  await act(async () => finish([{ nodeId: 'a', reading, review: null }]));
  const label = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(Date.parse(now) + reading.intervalDurationMs));
  await waitFor(() => expect(app.result.current.dueDateLabel).toBe(label));
  expect(invoke).toHaveBeenCalledWith('load_node_learning', { nodeIds: ['a'], libraryScope: 'library-a' });
  await act(async () => { expect(await app.result.current.submit(0)).toBe(true); });
  expect(app.ws.setReviewTopicDelay).toHaveBeenCalledWith('a', 0, now, reading);
  expect(app.ws.nodesById.a.reading).toBeNull();
});

it('recognizes a database null as an unlearned topic and queries again after closing', async () => {
  invoke.mockResolvedValue([{ nodeId: 'a', reading: null, review: null }]);
  const app = setup();
  act(() => { app.result.current.open(); });
  await waitFor(() => expect(app.result.current.isSubmitting).toBe(false));
  await act(async () => { expect(await app.result.current.submit(4)).toBe(true); });
  expect(app.ws.setReviewTopicDelay).toHaveBeenCalledWith('a', 4, now, null);
  invoke.mockResolvedValue([{ nodeId: 'a', reading, review: null }]);
  act(() => { app.result.current.open(); });
  await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
});

it('closes on a library switch and discards the old library reply', async () => {
  let finish: (value: unknown) => void = () => {};
  invoke.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const app = setup();
  act(() => { app.result.current.open(); });
  act(() => { useWorkspaceStore.setState({ libraryScope: 'library-b' }); });
  await act(async () => finish([{ nodeId: 'a', reading, review: null }]));
  expect(app.result.current.isOpen).toBe(false);
  expect(await app.result.current.submit(4)).toBe(false);
  expect(app.ws.setReviewTopicDelay).not.toHaveBeenCalled();
  expect(invoke).toHaveBeenCalledTimes(1);
});

it('closes on a failed database read without displaying a made-up date', async () => {
  invoke.mockRejectedValue(new Error('database_unavailable'));
  const app = setup();
  act(() => { app.result.current.open(); });
  await waitFor(() => expect(app.result.current.isOpen).toBe(false));
  expect(showAppRuntimeNotice).toHaveBeenCalledWith('Could not open Postpone. Please try again.');
  expect(app.ws.setReviewTopicDelay).not.toHaveBeenCalled();
});

it('refreshes the preview facts after a failed save before allowing a retry', async () => {
  invoke.mockResolvedValue([{ nodeId: 'a', reading, review: null }]);
  const app = setup();
  app.ws.setReviewTopicDelay.mockResolvedValueOnce(false);
  act(() => { app.result.current.open(); });
  await waitFor(() => expect(app.result.current.isSubmitting).toBe(false));
  const latest = { ...reading, intervalDurationMs: reading.intervalDurationMs * 2 };
  invoke.mockResolvedValue([{ nodeId: 'a', reading: latest, review: null }]);
  await act(async () => { expect(await app.result.current.submit(0)).toBe(false); });
  await waitFor(() => expect(app.result.current.isSubmitting).toBe(false));
  await act(async () => { expect(await app.result.current.submit(0)).toBe(true); });
  expect(app.ws.setReviewTopicDelay).toHaveBeenLastCalledWith('a', 0, now, latest);
});
