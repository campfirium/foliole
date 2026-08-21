import { screen } from '@testing-library/react';
import { createRef } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { NodeTreeRow } from '../../features/nodes/model/nodeTree';
import type { WorkspaceListNode, WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import type { WorkspaceTopicTreeDragController } from './workspaceTopicTreeDrag';
import { WorkspaceTopicTreeRows } from './WorkspaceTopicTreeRows';

beforeEach(() => {
  window.localStorage.clear();
});

function createRow(node: WorkspaceListNode, overrides: Partial<NodeTreeRow> = {}): NodeTreeRow {
  return {
    descendantCount: 0,
    depth: 0,
    hasChildren: false,
    node,
    ...overrides
  };
}

function createDragMock(): WorkspaceTopicTreeDragController {
  return {
    dropIntent: null,
    dropTargetNodeId: null,
    isRootDropActive: false,
    onDragEnd: vi.fn(),
    onDragEnterNode: vi.fn(),
    onDragLeaveNode: vi.fn(),
    onDragOverNode: vi.fn(),
    onDragOverRoot: vi.fn(),
    onDragStartNode: vi.fn(),
    onDropOnNode: vi.fn(),
    onDropRoot: vi.fn()
  };
}

function createTopicNode(id: string, title: string, parentNodeId: string | null = null): WorkspaceListNode {
  return {
    anchorLink: null,
    createdAt: '2026-05-02T00:00:00.000Z',
    hasContent: true,
    hasReveal: false,
    id,
    kind: 'topic',
    parentNodeId,
    reading: null,
    review: null,
    title,
    updatedAt: '2026-05-02T00:00:00.000Z'
  };
}

function createItemNode(id: string, title: string, parentNodeId: string): WorkspaceListNode {
  return {
    ...createTopicNode(id, title, parentNodeId),
    kind: 'item',
    review: {
      difficulty: 0,
      due: '2026-05-02T00:00:00.000Z',
      elapsedDays: 0,
      lapses: 0,
      lastReviewAt: null,
      reps: 0,
      scheduledDays: 0,
      stability: 0,
      state: 0
    }
  };
}

function renderTopicRows(rows: NodeTreeRow[], nodesById: WorkspaceListNodesById) {
  renderWithLocalization(
    <WorkspaceTopicTreeRows
      activeNodeId={null}
      collapsedNodeIds={new Set()}
      drag={createDragMock()}
      nodesById={nodesById}
      onContextMenu={vi.fn()}
      onRenameNode={vi.fn()}
      onSelectNode={vi.fn()}
      onToggleCollapse={vi.fn()}
      rows={rows}
      scrollContainerRef={createRef<HTMLDivElement>()}
      selectedNodeIds={[]}
    />
  );
}

it('applies dismissed appearance to topic rows under a shelved entry topic', () => {
  window.localStorage.setItem(
    APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedTopicAppearance,
    JSON.stringify({ fadeEnabled: true, fadeOpacity: 0.42, fadeWholeRow: true })
  );
  const parent: WorkspaceListNode = {
    ...createTopicNode('parent', 'Shelved entry'),
    shelvedAt: '2026-05-27T00:00:00.000Z'
  };
  const child = createTopicNode('child', 'Child topic', parent.id);

  renderTopicRows(
    [createRow(parent, { hasChildren: true }), createRow(child, { depth: 1 })],
    { [parent.id]: parent, [child.id]: child }
  );

  const parentRow = screen.getByRole('treeitem', { name: 'Shelved entry' });
  const childRow = screen.getByRole('treeitem', { name: 'Child topic' });
  expect(parentRow).toHaveAttribute('data-node-visibility', 'muted');
  expect(childRow).toHaveAttribute('data-node-visibility', 'muted');
  expect(childRow.querySelector('[data-node-icon-state="dismissed"]')).not.toBeNull();
});

it('keeps item rows active under a shelved entry topic', () => {
  window.localStorage.setItem(
    APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedTopicAppearance,
    JSON.stringify({ fadeEnabled: true, fadeOpacity: 0.42, fadeWholeRow: true })
  );
  const parent: WorkspaceListNode = {
    ...createTopicNode('parent', 'Shelved entry'),
    shelvedAt: '2026-05-27T00:00:00.000Z'
  };
  const item = createItemNode('item', 'Review item', parent.id);

  renderTopicRows(
    [createRow(parent, { hasChildren: true }), createRow(item, { depth: 1 })],
    { [parent.id]: parent, [item.id]: item }
  );

  const itemRow = screen.getByRole('treeitem', { name: 'Review item' });
  expect(itemRow).toHaveAttribute('data-node-visibility', 'normal');
  expect(itemRow.querySelector('[data-node-icon-state="dismissed"]')).toBeNull();
});

it('does not apply dismissed appearance to child topics under a dismissed parent', () => {
  window.localStorage.setItem(
    APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedTopicAppearance,
    JSON.stringify({ fadeEnabled: true, fadeOpacity: 0.42, fadeWholeRow: true })
  );
  const parent: WorkspaceListNode = {
    ...createTopicNode('parent', 'Dismissed parent'),
    reading: {
      intervalDurationMs: 0,
      intervalGrowthFactor: 1,
      lastHandledAt: '2026-05-27T00:00:00.000Z',
      nextAt: '2026-05-27T00:00:00.000Z',
      priority: 0,
      readingPosition: 0,
      repetitionCount: 0,
      state: 'dismissed'
    }
  };
  const child = createTopicNode('child', 'Active child', parent.id);

  renderTopicRows(
    [createRow(parent, { hasChildren: true }), createRow(child, { depth: 1 })],
    { [parent.id]: parent, [child.id]: child }
  );

  const parentRow = screen.getByRole('treeitem', { name: 'Dismissed parent' });
  const childRow = screen.getByRole('treeitem', { name: 'Active child' });
  expect(parentRow).toHaveAttribute('data-node-visibility', 'muted');
  expect(childRow).toHaveAttribute('data-node-visibility', 'normal');
  expect(childRow.querySelector('[data-node-icon-state="dismissed"]')).toBeNull();
});
