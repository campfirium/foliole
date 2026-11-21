import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildNodeTree, buildVisibleNodeTreeRows } from '../../features/nodes/model/nodeTree';
import type { WorkspaceListNode } from '../../features/nodes/model/workspaceListNode';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { TrashResultListPanel } from './TrashResultListPanel';

vi.mock('../../features/nodes/model/nodeTree', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/nodes/model/nodeTree')>();
  return {
    ...actual,
    buildNodeTree: vi.fn(actual.buildNodeTree),
    buildVisibleNodeTreeRows: vi.fn(actual.buildVisibleNodeTreeRows)
  };
});

function createNode(id: string, parentNodeId: string | null, kind: WorkspaceListNode['kind'] = 'topic'): WorkspaceListNode {
  return {
    createdAt: '2026-05-01T00:00:00.000Z',
    hasContent: kind !== 'folder',
    hasReveal: false,
    id,
    kind,
    parentNodeId,
    review: null,
    title: id,
    updatedAt: '2026-05-01T00:00:00.000Z'
  };
}

const nodesById = {
  folder: createNode('folder', null, 'folder'),
  kept: createNode('kept', 'folder'),
  trashed: createNode('trashed', null)
};
const nodeOrder = ['folder', 'kept', 'trashed'];
const trashedNodeIds = ['trashed'];

// Hosts pass fresh selection callbacks on every render; the library stays the same.
function Panel(props: { tick: number }) {
  return (
    <TrashResultListPanel
      nodeOrder={nodeOrder}
      nodesById={nodesById}
      onSelectNode={() => props.tick}
      onSelectTrashNode={() => props.tick}
      selectedTrashNodeId={null}
      trashedNodeIds={trashedNodeIds}
    />
  );
}

describe('TrashResultListPanel re-renders', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useWorkspaceStore.setState((state) => ({ ...state, trashedNodeDeletedAtById: {}, trashedNodeIds }));
    vi.mocked(buildNodeTree).mockClear();
    vi.mocked(buildVisibleNodeTreeRows).mockClear();
  });

  it('builds the visible note rows once while the library is unchanged', () => {
    const view = renderWithLocalization(<Panel tick={0} />);
    const buildsAfterMount = vi.mocked(buildVisibleNodeTreeRows).mock.calls.length;
    for (let tick = 1; tick <= 5; tick += 1) view.rerender(<Panel tick={tick} />);
    expect(buildVisibleNodeTreeRows).toHaveBeenCalledTimes(buildsAfterMount);
  });

  it('builds no library note trees on mount or when the library changes', () => {
    const view = renderWithLocalization(<Panel tick={0} />);
    const grownNodesById = { ...nodesById, added: createNode('added', 'folder') };
    view.rerender(
      <TrashResultListPanel
        nodeOrder={[...nodeOrder, 'added']}
        nodesById={grownNodesById}
        onSelectNode={() => undefined}
        onSelectTrashNode={() => undefined}
        selectedTrashNodeId={null}
        trashedNodeIds={trashedNodeIds}
      />
    );
    expect(buildNodeTree).not.toHaveBeenCalled();
    expect(buildVisibleNodeTreeRows).not.toHaveBeenCalled();
  });
});
