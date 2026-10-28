import { screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { VIRTUAL_ROOT_NODE_ID } from '../../features/nodes/model/specialNodes';
import { projectWorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceDualListContent } from './WorkspaceDualListContent';
import { createWorkspaceContentNode } from './WorkspaceDualListContent.testUtils';

afterEach(() => vi.restoreAllMocks());

function createProps(): ComponentProps<typeof WorkspaceDualListContent> {
  const nodesById: Record<string, Node> = {
    [VIRTUAL_ROOT_NODE_ID]: createWorkspaceContentNode({
      id: VIRTUAL_ROOT_NODE_ID, kind: 'folder', specialKind: 'virtual-root', title: 'Virtual'
    }),
    saved: createWorkspaceContentNode({
      id: 'saved', kind: 'folder', specialKind: 'virtual', title: 'Saved search',
      parentNodeId: VIRTUAL_ROOT_NODE_ID,
      virtualFilter: { conditions: [{ field: 'text', operator: 'contains', value: 'alpha' }], match: 'all', version: 1 }
    }),
    first: createWorkspaceContentNode({ id: 'first', kind: 'topic', title: 'First', content: 'alpha one' }),
    second: createWorkspaceContentNode({ id: 'second', kind: 'topic', title: 'Second', content: 'alpha two' })
  };
  return {
    activeNodeId: 'saved', activeVirtualNodeId: 'saved', nodesById,
    listNodesById: projectWorkspaceListNodesById(nodesById), nodeOrder: Object.keys(nodesById),
    externalEntriesByFolderId: {}, externalFolders: [], externalSelection: { kind: 'root' },
    isExternalViewOpen: false, isStudyMode: false, isTrashViewOpen: false, isVirtualViewOpen: true,
    onOpenMoveToNode: vi.fn(), onOpenNotesView: vi.fn(), onOpenExternalSelection: vi.fn(),
    onOpenTrashView: vi.fn(), onOpenVirtualView: vi.fn(), onSelectNode: vi.fn(),
    onSelectNodeInVirtualView: vi.fn(), onSelectTrashNode: vi.fn(),
    reviewCurrentNodeId: null, selectedTrashNodeId: null, trashedNodeIds: []
  };
}

function countPreparedText() {
  let count = 0;
  const original = String.prototype.toLocaleLowerCase;
  vi.spyOn(String.prototype, 'toLocaleLowerCase').mockImplementation(function (this: string) {
    if (String(this).includes('\nalpha ')) count += 1;
    return original.call(this);
  });
  return { read: () => count, reset: () => { count = 0; } };
}

it('keeps saved-search text prepared across unrelated scheduling updates in the real list', () => {
  const props = createProps();
  const prepared = countPreparedText();
  const view = renderWithLocalization(<WorkspaceDualListContent {...props} />);
  expect(prepared.read()).toBe(2);
  expect(screen.getByRole('treeitem', { name: 'First' })).toBeVisible();
  expect(screen.getByRole('treeitem', { name: 'Second' })).toBeVisible();
  prepared.reset();
  const nodesById = { ...props.nodesById, first: { ...props.nodesById.first!, priority: 9, updatedAt: '2026-10-28' } };
  const next = { ...props, nodesById, listNodesById: projectWorkspaceListNodesById(nodesById, props.listNodesById) };
  view.rerender(<WorkspaceDualListContent {...next} />);
  view.rerender(<WorkspaceDualListContent {...next} activeNodeId="first" />);
  expect(prepared.read()).toBe(0);
  expect(screen.getByRole('treeitem', { name: 'First' })).toBeVisible();
  expect(screen.getByRole('treeitem', { name: 'Second' })).toBeVisible();
});

it('refreshes saved-search membership when the article text changes after a scheduling update', () => {
  const props = createProps();
  const view = renderWithLocalization(<WorkspaceDualListContent {...props} />);
  const nodesById = { ...props.nodesById, first: { ...props.nodesById.first!, priority: 9 } };
  view.rerender(<WorkspaceDualListContent {...props} nodesById={nodesById} />);
  const changed = { ...nodesById, first: { ...nodesById.first!, content: 'removed match' } };
  view.rerender(<WorkspaceDualListContent {...props} nodesById={changed} />);
  expect(screen.queryByRole('treeitem', { name: 'First' })).not.toBeInTheDocument();
  expect(screen.getByRole('treeitem', { name: 'Second' })).toBeVisible();
});
