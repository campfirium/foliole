import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { DailyFlowSession } from '../../lib/core/flow/dailyFlowSession';
import type { DailyFlowView } from '../../lib/core/flow/dailyFlowViewContract';
import { readCompanionDailyFlowView } from '../shared/platform/companion/runtime/companionDailyFlow';

import { useCompanionFlowReadView } from './useCompanionFlowReadView';

vi.mock('../shared/platform/companion/runtime/companionDailyFlow', () => ({ readCompanionDailyFlowView: vi.fn() }));
vi.mock('../shared/platform/companionWorkspaceRuntimeRepository', () => ({ isAvailableNativeCompanionRuntime: () => true }));
const session: DailyFlowSession = { currentNodeId: null, queueNodeIds: [], isAnswerRevealed: false,
  totalNodeCount: 1, reviewedItemCount: 1, continueNodeId: 'target', daily: { scope: 'scope', dayKey: 'day', revision: 1 } };
const view: DailyFlowView = { status: 'ready', scope: 'scope', dayKey: 'day', revision: 1, now: '',
  mode: 'recommended', currentNodeId: null, nodeIds: null, complete: false,
  modeAvailability: { recommended: true, 'review-first': false, 'reading-only': true }, canContinueReading: false };
beforeEach(() => vi.clearAllMocks());

it('uses target eligibility from the service and surfaces a failed read', async () => {
  vi.mocked(readCompanionDailyFlowView).mockResolvedValue(view);
  const app = renderHook(({ source }) => useCompanionFlowReadView(true, true, source, 'recommended', 'library'),
    { initialProps: { source: session } });
  await waitFor(() => expect(app.result.current?.view?.canContinueReading).toBe(false));
  expect(readCompanionDailyFlowView).toHaveBeenCalledWith(expect.objectContaining({ continueNodeId: 'target', includeEntries: false }));
  vi.mocked(readCompanionDailyFlowView).mockRejectedValue(new Error('read_failed'));
  app.rerender({ source: { ...session } });
  await waitFor(() => expect(app.result.current?.error).toContain('read_failed'));
});

it('does not publish an old mode result after switching to review only', async () => {
  let finish!: (value: DailyFlowView) => void;
  vi.mocked(readCompanionDailyFlowView).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }))
    .mockResolvedValueOnce({ ...view, mode: 'review-first' });
  const app = renderHook(({ mode }: { mode: 'recommended' | 'review-first' }) =>
    useCompanionFlowReadView(true, true, session, mode, 'library'), { initialProps: { mode: 'recommended' } });
  app.rerender({ mode: 'review-first' });
  await waitFor(() => expect(app.result.current?.view?.mode).toBe('review-first'));
  await act(async () => { finish({ ...view, canContinueReading: true }); });
  expect(app.result.current?.view?.mode).toBe('review-first');
  expect(app.result.current?.view?.canContinueReading).toBe(false);
});
