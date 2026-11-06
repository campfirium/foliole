import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { WorkspaceNodeSnapshot } from '../../../lib/core/database/workspaceSnapshotHelpers';
import type { DailyFlowView } from '../../../lib/core/flow/dailyFlowViewContract';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { loadDailyFlowViewRuntime } from '../../shared/platform/runtime/dailyFlowRuntimeRepository';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { createQaNode } from '../../store/workspaceStoreReviewActions.test-support';

import { WorkspaceRightSidebarReviewQueuePanel } from './WorkspaceRightSidebarReviewQueuePanel';

vi.mock('../../shared/platform/runtime/dailyFlowRuntimeRepository', () => ({
  hasDailyFlowRuntime: () => true, loadDailyFlowViewRuntime: vi.fn()
}));
const now = '2026-11-06T08:00:00.000Z';
const initial = useWorkspaceStore.getState();
const view: DailyFlowView = { status: 'ready', scope: 'a', dayKey: 'day', revision: 1, now,
  mode: 'recommended', currentNodeId: 'first', nodeIds: ['first', 'second'], complete: true,
  modeAvailability: { recommended: true, 'review-first': false, 'reading-only': true }, canContinueReading: false };
const projectedNode: WorkspaceNodeSnapshot = { id: 'first', parentNodeId: null, kind: 'topic',
  title: 'first', content: 'Original', reading: null, review: null, reveal: null, anchorLink: null,
  isTitleManual: true, hideTitleHeading: false, createdAt: now, updatedAt: now };
const response = { view, nodes: { first: projectedNode } };

beforeEach(() => {
  vi.resetAllMocks();
  useWorkspaceStore.setState({ libraryScope: 'a', isHydrated: true, reviewSessionMode: 'recommended',
    nodesById: Object.fromEntries(['first', 'second'].map(id => [id, createQaNode(id, now)])),
    reviewSession: { currentNodeId: null, queueNodeIds: [], totalNodeCount: 0, isAnswerRevealed: false } });
});
afterEach(() => act(() => useWorkspaceStore.setState(initial, true)));

it('keeps the real subscribed panel usable through body and title refreshes, then applies a changed queue', async () => {
  vi.mocked(loadDailyFlowViewRuntime).mockResolvedValueOnce(response);
  renderWithLocalization(<WorkspaceRightSidebarReviewQueuePanel currentNodeId={null}
    flowWindow={{ queueNodeIds: [], readyNodeIds: [], upcomingNodeIds: [], dayBuckets: [], dayOffsetByNodeId: {}, queriedAt: now }} nodesById={{}} onSelectNode={() => {}} />);
  const list = await screen.findByRole('list', { name: 'Flow items' });
  expect(screen.getByRole('button', { name: 'first' })).toBeInTheDocument();
  for (const patch of [{ content: 'Edited body' }, { title: 'Renamed first' }]) {
    let finish!: (value: typeof response) => void;
    vi.mocked(loadDailyFlowViewRuntime).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    act(() => useWorkspaceStore.setState(state => ({ nodesById: { ...state.nodesById,
      first: { ...state.nodesById.first!, ...patch } } })));
    expect(list).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Flow items' })).toBe(list);
    expect(screen.getByRole('button', { name: patch.title ?? 'first' })).toBeInTheDocument();
    await act(async () => { finish(response); });
    expect(screen.getByRole('list', { name: 'Flow items' })).toBe(list);
  }
  let finish!: (value: typeof response) => void;
  vi.mocked(loadDailyFlowViewRuntime).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  act(() => useWorkspaceStore.setState(state => ({ nodesById: { ...state.nodesById,
    second: { ...state.nodesById.second!, content: 'Changed eligibility' } } })));
  expect(list).toBeInTheDocument();
  await act(async () => { finish({ ...response, view: { ...view, revision: 2, nodeIds: ['first'] } }); });
  await waitFor(() => expect(screen.queryByRole('button', { name: 'second' })).not.toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Renamed first' })).toBeInTheDocument();
});
