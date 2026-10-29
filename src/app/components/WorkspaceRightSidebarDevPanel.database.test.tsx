import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), state: { libraryScope: 'a' } }));
vi.mock('../../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: () => mocks.invoke, isRuntimeInvokeAvailable: () => true }));
vi.mock('../../store/workspaceStore', () => ({ useWorkspaceStore: (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state) }));

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
