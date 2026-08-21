import { screen } from '@testing-library/react';
import { createRef } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { NodeTreeRow } from '../../features/nodes/model/nodeTree';
import type { WorkspaceListNode } from '../../features/nodes/model/workspaceListNode';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import type { WorkspaceTopicTreeDragController } from './workspaceTopicTreeDrag';
import { WorkspaceTopicTreeRows } from './WorkspaceTopicTreeRows';

beforeEach(() => {
  window.localStorage.clear();
});

function createRow(node: NonNullable<WorkspaceListNodesById[string]>, overrides: Partial<NodeTreeRow> = {}): NodeTreeRow {
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

function createTopicNode(index: number): WorkspaceListNode {
  return {
    anchorLink: null,
    createdAt: '2026-05-02T00:00:00.000Z',
    hasContent: true,
    hasReveal: false,
    id: `node-${index}`,
    kind: 'topic',
    parentNodeId: null,
    reading: null,
    review: null,
    title: `Topic ${index}`,
    updatedAt: '2026-05-02T00:00:00.000Z'
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

it('applies dismissed appearance to topic tree row text and icon', () => {
  window.localStorage.setItem(
    APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedTopicAppearance,
    JSON.stringify({ fadeEnabled: true, fadeOpacity: 0.42, fadeTextOpacity: 0.31 })
  );
  const node: WorkspaceListNode = {
      anchorLink: null,
      createdAt: '2026-05-02T00:00:00.000Z',
      hasContent: true,
      hasReveal: false,
      id: 'node-1',
      kind: 'topic',
      parentNodeId: null,
      reading: {
        intervalDurationMs: 0,
        intervalGrowthFactor: 1,
        lastHandledAt: '2026-05-02T00:00:00.000Z',
        nextAt: '2026-05-02T00:00:00.000Z',
        priority: 0,
        readingPosition: 0,
        repetitionCount: 0,
        state: 'dismissed'
      },
      review: null,
      title: 'Dismissed topic',
      updatedAt: '2026-05-02T00:00:00.000Z'
  };
  const nodesById: WorkspaceListNodesById = {
    'node-1': node
  };

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
      rows={[createRow(node)]}
      scrollContainerRef={createRef<HTMLDivElement>()}
      selectedNodeIds={[]}
    />
  );

  const row = screen.getByRole('treeitem', { name: 'Dismissed topic' });
  expect(row).toHaveAttribute('data-node-visibility', 'muted');
  expect(row).toHaveStyle({ '--node-muted-opacity': '0.31' });
  expect(row.querySelector('[data-node-icon-state="dismissed"]')).toHaveStyle({ opacity: '0.42' });
});

it('renders markdown-looking topic titles as plain list text', () => {
  const node: WorkspaceListNode = {
    anchorLink: null,
    createdAt: '2026-05-02T00:00:00.000Z',
    hasContent: true,
    hasReveal: false,
    id: 'node-1',
    kind: 'topic',
    parentNodeId: null,
    reading: null,
    review: null,
    title: '#煮饺子时中途要不要加凉水#',
    updatedAt: '2026-05-02T00:00:00.000Z'
  };
  renderWithLocalization(
    <WorkspaceTopicTreeRows
      activeNodeId={null}
      collapsedNodeIds={new Set()}
      drag={createDragMock()}
      nodesById={{ 'node-1': node }}
      onContextMenu={vi.fn()}
      onRenameNode={vi.fn()}
      onSelectNode={vi.fn()}
      onToggleCollapse={vi.fn()}
      rows={[createRow(node)]}
      scrollContainerRef={createRef<HTMLDivElement>()}
      selectedNodeIds={[]}
    />
  );

  expect(screen.getByRole('treeitem', { name: '煮饺子时中途要不要加凉水' })).toBeInTheDocument();
  expect(screen.queryByText('#煮饺子时中途要不要加凉水#')).not.toBeInTheDocument();
});

it('does not show chevron placeholders for topic rows without children', () => {
  const root = createTopicNode(1);
  const child = { ...createTopicNode(2), parentNodeId: root.id };
  const derived = { ...createTopicNode(3), anchorLink: { id: 'source-3', kind: 'highlight' as const } };
  const parent = createTopicNode(4);
  const nested = { ...createTopicNode(5), parentNodeId: parent.id };
  renderTopicRows(
    [
      createRow(root),
      createRow(child, { depth: 1 }),
      createRow(derived),
      createRow(parent, { hasChildren: true }),
      createRow(nested, { depth: 1 })
    ],
    {
      [root.id]: root,
      [child.id]: child,
      [derived.id]: derived,
      [parent.id]: parent,
      [nested.id]: nested
    }
  );

  expect(screen.getByRole('treeitem', { name: 'Topic 1' }).querySelector('[data-node-tree-chevron-placeholder="true"]')).toBeNull();
  expect(screen.getByRole('treeitem', { name: 'Topic 2' }).querySelector('[data-node-tree-chevron-placeholder="true"]')).toBeNull();
  expect(screen.getByRole('treeitem', { name: 'Topic 3' }).querySelector('[data-node-tree-chevron-placeholder="true"]')).toBeNull();
  expect(screen.getByRole('treeitem', { name: 'Topic 4' }).querySelector('[data-node-tree-chevron="true"]')).not.toBeNull();
});

it('keeps virtual row sizing aligned with folder tree row spacing', () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.nodeListRowSpacing, '6');
  const nodes = Array.from({ length: 20 }, (_, index) => createTopicNode(index));
  const nodesById = Object.fromEntries(nodes.map((node) => [node.id, node])) as WorkspaceListNodesById;

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
      rows={nodes.map((node) => createRow(node))}
      scrollContainerRef={createRef<HTMLDivElement>()}
      selectedNodeIds={[]}
    />
  );

  expect(screen.getByRole('tree', { name: 'Topic list' })).toHaveAttribute('data-node-list-row-gap', '4');
  expect(document.querySelector('[data-virtual-list="true"]')).toHaveStyle({ height: `${20 * (20 + 6 * 2) + 19 * 4}px` });
});
