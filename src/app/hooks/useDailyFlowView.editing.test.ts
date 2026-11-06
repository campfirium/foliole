import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { DailyFlowView } from '../../../lib/core/flow/dailyFlowViewContract';
import type { WorkspaceContentChangedPayload } from '../../shared/platform/electronApi';
import { loadDailyFlowViewRuntime } from '../../shared/platform/runtime/dailyFlowRuntimeRepository';
import { createQaNode } from '../../store/workspaceStoreReviewActions.test-support';

import { useDailyFlowView } from './useDailyFlowView';

const events = vi.hoisted(() => ({ changed: null as null | ((payload: Pick<WorkspaceContentChangedPayload, 'libraryScope' | 'workspaceScope' | 'refreshWorkspace'>) => void) }));
vi.mock('../../shared/platform/runtimeShellEvents', () => ({
  onWorkspaceContentChanged: async (handler: NonNullable<typeof events.changed>) => { events.changed = handler; return () => {}; },
  onWorkspaceSyncApplied: async () => () => {}
}));

vi.mock('../../shared/platform/runtime/dailyFlowRuntimeRepository', () => ({
  hasDailyFlowRuntime: () => true, loadDailyFlowViewRuntime: vi.fn()
}));
const now = '2026-11-06T08:00:00.000Z';
const view: DailyFlowView = { status: 'ready', scope: 'a', dayKey: now, revision: 1, now, mode: 'recommended',
  currentNodeId: 'topic', nodeIds: ['topic'], complete: true,
  modeAvailability: { recommended: true, 'review-first': false, 'reading-only': true }, canContinueReading: false };

it('does not query learning for ordinary text edits but refreshes when body eligibility changes', async () => {
  vi.mocked(loadDailyFlowViewRuntime).mockResolvedValue({ view });
  const node = { ...createQaNode('topic', now), content: 'Original body' };
  const input = { libraryScope: 'a', now, nodesById: { topic: node }, includeEntries: true, enabled: true,
    reviewSessionMode: 'recommended' as const,
    reviewSession: { currentNodeId: null, queueNodeIds: [], totalNodeCount: 0, isAnswerRevealed: false,
      daily: { scope: 'a', dayKey: now, revision: 1 } } };
  const app = renderHook(useDailyFlowView, { initialProps: input });
  await waitFor(() => expect(app.result.current?.view).toEqual(view));
  app.rerender({ ...input, nodesById: { topic: { ...node, title: 'Renamed', content: 'Edited body', updatedAt: now } } });
  await act(async () => {});
  expect(loadDailyFlowViewRuntime).toHaveBeenCalledTimes(1);
  vi.mocked(loadDailyFlowViewRuntime).mockResolvedValue({ view: { ...view, nodeIds: [] } });
  app.rerender({ ...input, nodesById: { topic: { ...node, content: '', hasContent: false } } });
  await waitFor(() => expect(app.result.current?.view?.nodeIds).toEqual([]));
  expect(loadDailyFlowViewRuntime).toHaveBeenCalledTimes(2);
  act(() => events.changed?.({ libraryScope: 'a', refreshWorkspace: false,
    workspaceScope: { kind: 'nodes', nodeIds: [], readingNodeIds: ['topic'] } }));
  expect(loadDailyFlowViewRuntime).toHaveBeenCalledTimes(2);
  vi.mocked(loadDailyFlowViewRuntime).mockResolvedValue({ view: { ...view, revision: 2 } });
  act(() => events.changed?.({ libraryScope: 'a', workspaceScope: { kind: 'nodes', nodeIds: [], readingNodeIds: ['topic'] } }));
  await waitFor(() => expect(app.result.current?.view?.revision).toBe(2));
});

it('refreshes queue membership when a target enters trash without changing its node projection', async () => {
  vi.mocked(loadDailyFlowViewRuntime).mockReset().mockResolvedValue({ view });
  const node = { ...createQaNode('topic', now), content: 'Body' };
  const input = { libraryScope: 'a', now, nodesById: { topic: node }, includeEntries: true, enabled: true,
    trashedNodeIds: [] as string[], reviewSessionMode: 'recommended' as const,
    reviewSession: { currentNodeId: null, queueNodeIds: [], totalNodeCount: 0, isAnswerRevealed: false } };
  const app = renderHook(useDailyFlowView, { initialProps: input });
  await waitFor(() => expect(app.result.current?.view).toEqual(view));
  vi.mocked(loadDailyFlowViewRuntime).mockResolvedValue({ view: { ...view, nodeIds: [] } });
  app.rerender({ ...input, trashedNodeIds: ['topic'] });
  await waitFor(() => expect(app.result.current?.view?.nodeIds).toEqual([]));
});
