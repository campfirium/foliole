import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { DailyFlowView } from '../../../lib/core/flow/dailyFlowViewContract';
import { loadDailyFlowViewRuntime } from '../../shared/platform/runtime/dailyFlowRuntimeRepository';
import { createQaNode } from '../../store/workspaceStoreReviewActions.test-support';

import { useDailyFlowView } from './useDailyFlowView';

vi.mock('../../shared/platform/runtime/dailyFlowRuntimeRepository', () => ({
  hasDailyFlowRuntime: () => true, loadDailyFlowViewRuntime: vi.fn()
}));
const view = (scope: string): DailyFlowView => ({ status: 'ready', scope, dayKey: 'day', revision: 1,
  now: '2026-10-27T08:00:00.000Z', mode: 'recommended', currentNodeId: 'current', nodeIds: null, complete: false,
  modeAvailability: { recommended: true, 'review-first': true, 'reading-only': true }, canContinueReading: false });
const input = { libraryScope: 'a', reviewSession: { currentNodeId: null, queueNodeIds: [],
  totalNodeCount: 0, isAnswerRevealed: false }, reviewSessionMode: 'recommended' as const, nodesById: {},
  now: '2026-10-27T08:00:00.000Z', includeEntries: false, enabled: true };
let revision = 0;
function changedNodes() {
  const id = `changed-${++revision}`;
  return { [id]: createQaNode(id, input.now) };
}
beforeEach(() => { vi.resetAllMocks(); revision = 0; });

it('requests only a summary until a list consumer asks for entries and releases disabled demand', async () => {
  vi.mocked(loadDailyFlowViewRuntime).mockResolvedValue({ view: view('a'), nodes: undefined });
  const app = renderHook(useDailyFlowView, { initialProps: input });
  await waitFor(() => expect(app.result.current?.view?.scope).toBe('a'));
  expect(loadDailyFlowViewRuntime).toHaveBeenLastCalledWith(expect.objectContaining({ includeEntries: false }),
    input.reviewSession, input.nodesById);
  app.rerender({ ...input, includeEntries: true });
  await waitFor(() => expect(loadDailyFlowViewRuntime).toHaveBeenCalledTimes(2));
  expect(loadDailyFlowViewRuntime).toHaveBeenLastCalledWith(expect.objectContaining({ includeEntries: true }),
    input.reviewSession, input.nodesById);
  app.rerender({ ...input, enabled: false });
  expect(app.result.current).toBeNull();
  expect(loadDailyFlowViewRuntime).toHaveBeenCalledTimes(2);
});

it('rejects a late result from a previous library', async () => {
  let finishOld!: (value: { view: DailyFlowView; nodes: undefined }) => void;
  vi.mocked(loadDailyFlowViewRuntime).mockReturnValueOnce(new Promise(resolve => { finishOld = resolve; }))
    .mockResolvedValueOnce({ view: view('b'), nodes: undefined });
  const app = renderHook(useDailyFlowView, { initialProps: input });
  app.rerender({ ...input, libraryScope: 'b' });
  await waitFor(() => expect(app.result.current?.view?.scope).toBe('b'));
  await act(async () => { finishOld({ view: view('a'), nodes: undefined }); });
  expect(app.result.current?.view?.scope).toBe('b');
});

it('keeps summary availability during a node refresh and replaces a failure without retaining its stale view', async () => {
  vi.mocked(loadDailyFlowViewRuntime).mockResolvedValueOnce({ view: view('a'), nodes: undefined });
  const app = renderHook(useDailyFlowView, { initialProps: input });
  await waitFor(() => expect(app.result.current?.view?.modeAvailability.recommended).toBe(true));
  let fail!: (error: Error) => void;
  vi.mocked(loadDailyFlowViewRuntime).mockReturnValueOnce(new Promise((_, reject) => { fail = reject; }));
  app.rerender({ ...input, nodesById: changedNodes() });
  expect(app.result.current?.view?.modeAvailability.recommended).toBe(true);
  await act(async () => { fail(new Error('read failed')); });
  expect(app.result.current?.error).toContain('read failed');
  expect(app.result.current?.view).toBeUndefined();
  let finish!: (value: { view: DailyFlowView; nodes: undefined }) => void;
  vi.mocked(loadDailyFlowViewRuntime).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  app.rerender({ ...input, nodesById: changedNodes() });
  expect(app.result.current).toBeNull();
  await act(async () => { finish({ view: view('a'), nodes: undefined }); });
  expect(app.result.current?.view?.scope).toBe('a');
});

it.each(['libraryScope', 'reviewSessionMode', 'now', 'includeEntries', 'reviewSession', 'enabled'] as const)(
  'withdraws previous results immediately when %s changes and rejects its pending refresh', async key => {
    vi.mocked(loadDailyFlowViewRuntime).mockResolvedValueOnce({ view: view('a'), nodes: undefined });
    const app = renderHook(useDailyFlowView, { initialProps: input });
    await waitFor(() => expect(app.result.current?.view?.scope).toBe('a'));
    let finish!: (value: { view: DailyFlowView; nodes: undefined }) => void;
    vi.mocked(loadDailyFlowViewRuntime).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    app.rerender({ ...input, nodesById: changedNodes() });
    expect(app.result.current?.view?.scope).toBe('a');
    vi.mocked(loadDailyFlowViewRuntime).mockReturnValueOnce(new Promise(() => {}));
    const changes = { libraryScope: 'b', reviewSessionMode: 'reading-only' as const,
      now: '2026-10-28T08:00:00.000Z', includeEntries: true,
      reviewSession: { ...input.reviewSession, currentNodeId: 'other' }, enabled: false };
    app.rerender({ ...input, [key]: changes[key] });
    expect(app.result.current).toBeNull();
    await act(async () => { finish({ view: view('a'), nodes: undefined }); });
    expect(app.result.current).toBeNull();
  }
);

it('ignores an older refresh after a newer refresh has completed in the same context', async () => {
  vi.mocked(loadDailyFlowViewRuntime).mockResolvedValueOnce({ view: view('a'), nodes: undefined });
  const app = renderHook(useDailyFlowView, { initialProps: input });
  await waitFor(() => expect(app.result.current?.view?.scope).toBe('a'));
  let finish!: (value: { view: DailyFlowView; nodes: undefined }) => void;
  vi.mocked(loadDailyFlowViewRuntime).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  app.rerender({ ...input, nodesById: changedNodes() });
  vi.mocked(loadDailyFlowViewRuntime).mockResolvedValueOnce({ view: { ...view('a'), revision: 2 }, nodes: undefined });
  app.rerender({ ...input, nodesById: changedNodes() });
  await waitFor(() => expect(app.result.current?.view?.revision).toBe(2));
  await act(async () => { finish({ view: view('a'), nodes: undefined }); });
  expect(app.result.current?.view?.revision).toBe(2);
});
