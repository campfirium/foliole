import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { DailyFlowView } from '../../../lib/core/flow/dailyFlowViewContract';
import { loadDailyFlowViewRuntime } from '../../shared/platform/runtime/dailyFlowRuntimeRepository';

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
beforeEach(() => vi.clearAllMocks());

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
