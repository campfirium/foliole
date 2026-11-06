import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import type { WorkspaceContentChangedPayload } from '../../shared/platform/electronApi';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), state: { libraryScope: 'a' }, changed: null as null | ((payload: Pick<WorkspaceContentChangedPayload, 'libraryScope' | 'workspaceScope'>) => void), synced: null as null | ((payload: Pick<WorkspaceContentChangedPayload, 'libraryScope' | 'workspaceScope'>) => void) }));
vi.mock('../../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: () => mocks.invoke, isRuntimeInvokeAvailable: () => true }));
vi.mock('../../store/workspaceStore', () => ({ useWorkspaceStore: (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state) }));

vi.mock('../../shared/platform/runtimeShellEvents', () => ({
  onWorkspaceContentChanged: async (handler: NonNullable<typeof mocks.changed>) => { mocks.changed = handler; return () => {}; },
  onWorkspaceSyncApplied: async (handler: NonNullable<typeof mocks.synced>) => { mocks.synced = handler; return () => {}; }
}));

import { WorkspaceRightSidebarDevPanel } from './WorkspaceRightSidebarDevPanel';

const node: Node = { id: 'card', parentNodeId: null, kind: 'item', title: 'Card', content: '', reveal: null,
  review: null, reading: null, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' };
const review = { due: '2026-11-01T00:00:00.000Z', lastReviewAt: '2026-10-01T00:00:00.000Z', state: 2,
  stability: 5, difficulty: 7.5, elapsedDays: 2, scheduledDays: 30, reps: 42, lapses: 1 };
beforeEach(() => { vi.clearAllMocks(); mocks.state.libraryScope = 'a'; });
afterEach(cleanup);

it('shows persisted learning when the workspace does not retain a complete profile', async () => {
  mocks.invoke.mockResolvedValue([{ nodeId: 'card', reading: null, review }]);
  renderWithLocalization(<WorkspaceRightSidebarDevPanel activeNodeId="card" nodesById={{ card: node }} />);
  await waitFor(() => expect(screen.getByText('7.50')).toBeVisible());
  expect(screen.getByText('42')).toBeVisible();
  expect(mocks.invoke).toHaveBeenCalledWith('load_node_learning', expect.objectContaining({
    nodeIds: ['card'], libraryScope: 'a'
  }));
  expect(node.review).toBeNull();
});

it('does not display a late old-library profile after switching libraries', async () => {
  let resolveOld!: (value: unknown) => void;
  mocks.invoke.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
    .mockResolvedValue([{ nodeId: 'card', reading: null, review: { ...review, difficulty: 8.5 } }]);
  const { rerender } = renderWithLocalization(<WorkspaceRightSidebarDevPanel activeNodeId="card" nodesById={{ card: node }} />);
  mocks.state.libraryScope = 'b';
  rerender(<WorkspaceRightSidebarDevPanel activeNodeId="card" nodesById={{ card: node }} />);
  await waitFor(() => expect(screen.getByText('8.50')).toBeVisible());
  await act(async () => resolveOld([{ nodeId: 'card', reading: null, review }]));
  expect(screen.queryByText('7.50')).toBeNull();
});


it('does not fall back to retained workspace facts after a database read fails', async () => {
  mocks.invoke.mockRejectedValue(new Error('database unavailable'));
  renderWithLocalization(<WorkspaceRightSidebarDevPanel activeNodeId="card"
    nodesById={{ card: { ...node, review: { ...review, state: 2 } } }} />);
  await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
  expect(screen.queryByText('7.50')).toBeNull();
  expect(screen.queryByText('42')).toBeNull();
});

it('keeps scheduling present without rereading learning for body and title edits', async () => {
  mocks.invoke.mockResolvedValue([{ nodeId: 'card', reading: null, review }]);
  const app = renderWithLocalization(<WorkspaceRightSidebarDevPanel activeNodeId="card" nodesById={{ card: node }} />);
  const difficulty = await screen.findByText('7.50');
  mocks.invoke.mockImplementation(() => new Promise(() => {}));
  for (const patch of [{ content: 'Edited body', updatedAt: '2026-11-06T08:00:00Z' }, { title: 'Renamed card' }]) {
    app.rerender(<WorkspaceRightSidebarDevPanel activeNodeId="card" nodesById={{ card: { ...node, ...patch } }} />);
    act(() => mocks.changed?.({ libraryScope: 'a', workspaceScope: { kind: 'nodes', nodeIds: ['card'] } }));
    expect(difficulty).toBeVisible();
    await act(async () => {});
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  }
});

it('refreshes persisted learning for target learning events, not unrelated nodes or libraries', async () => {
  mocks.invoke.mockResolvedValue([{ nodeId: 'card', reading: null, review }]);
  renderWithLocalization(<WorkspaceRightSidebarDevPanel activeNodeId="card" nodesById={{ card: node }} />);
  await screen.findByText('7.50');
  act(() => {
    mocks.changed?.({ libraryScope: 'b', workspaceScope: { kind: 'full' } });
    mocks.changed?.({ libraryScope: 'a', workspaceScope: { kind: 'nodes', nodeIds: [], reviewNodeIds: ['other'] } });
  });
  expect(mocks.invoke).toHaveBeenCalledTimes(1);
  mocks.invoke.mockResolvedValue([{ nodeId: 'card', reading: null, review: { ...review, difficulty: 8.5 } }]);
  act(() => mocks.changed?.({ libraryScope: 'a', workspaceScope: { kind: 'nodes', nodeIds: [], reviewNodeIds: ['card'] } }));
  await screen.findByText('8.50');
  mocks.invoke.mockResolvedValue([{ nodeId: 'card', reading: null, review: { ...review, difficulty: 9.5 } }]);
  act(() => mocks.synced?.({ libraryScope: 'a', workspaceScope: { kind: 'nodes', nodeIds: [], reviewNodeIds: ['card'] } }));
  await screen.findByText('9.50');
  mocks.invoke.mockRejectedValue(new Error('database unavailable'));
  act(() => mocks.changed?.({ libraryScope: 'a', workspaceScope: { kind: 'nodes', nodeIds: [], readingNodeIds: ['card'] } }));
  await waitFor(() => expect(screen.queryByText('9.50')).toBeNull());
});

it('rejects a late learning refresh after a newer one succeeds', async () => {
  mocks.invoke.mockResolvedValue([{ nodeId: 'card', reading: null, review }]);
  renderWithLocalization(<WorkspaceRightSidebarDevPanel activeNodeId="card" nodesById={{ card: node }} />);
  await screen.findByText('7.50');
  let finish!: (value: unknown) => void;
  mocks.invoke.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  act(() => mocks.changed?.({ libraryScope: 'a', workspaceScope: { kind: 'full' } }));
  expect(screen.getByText('7.50')).toBeVisible();
  mocks.invoke.mockResolvedValue([{ nodeId: 'card', reading: null, review: { ...review, difficulty: 9.5 } }]);
  act(() => mocks.changed?.({ libraryScope: 'a', workspaceScope: { kind: 'full' } }));
  await screen.findByText('9.50');
  await act(async () => finish([{ nodeId: 'card', reading: null, review: { ...review, difficulty: 8.5 } }]));
  expect(screen.queryByText('8.50')).toBeNull();
  expect(screen.getByText('9.50')).toBeVisible();
});
