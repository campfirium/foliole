import { screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../../lib/core/database/workspaceSnapshot';
import type { FolderListSortKey } from '../../features/nodes/model/folderListOrdering';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { resolveCompanionFolderViewByNodeId } from '../../shared/platform/companionBrowseLists';

import { FolderListView } from './FolderListView';

function node(id: string, kind: Node['kind'], title: string, day: number): Node {
  const timestamp = `2026-10-0${day}T00:00:00.000Z`;
  return {
    id, kind, title, parentNodeId: 'parent', content: '', reveal: null, review: null,
    createdAt: timestamp, updatedAt: timestamp
  };
}

const children = [
  node('doc-a', 'topic', 'A document', 4),
  node('folder-a', 'folder', 'B folder', 2),
  node('doc-z', 'topic', 'Y document', 3),
  node('folder-z', 'folder', 'Z folder', 1)
];
const parent = { ...node('parent', 'folder', 'Parent', 1), parentNodeId: null };
const nodesById = Object.fromEntries([parent, ...children].map((entry) => [entry.id, entry]));

function list(sortKey: FolderListSortKey, sortDirection: 'asc' | 'desc', direct = true) {
  return <FolderListView
    {...(direct ? { folderNodeId: 'parent' } : { nodes: children })}
    nodeOrder={['parent', ...children.map((entry) => entry.id)]}
    nodesById={nodesById}
    nodeOpenStateById={Object.fromEntries(children.map((entry) => [entry.id, { lastOpenedAt: entry.updatedAt }]))}
    onSelectNode={vi.fn()}
    sortKey={sortKey}
    sortDirection={sortDirection}
  />;
}

function titles() {
  return within(screen.getByRole('list', { name: 'Folder contents' })).getAllByRole('button')
    .map((button) => button.getAttribute('aria-label')?.replace(/^Open\s+/, ''));
}

it.each(['name', 'dateSaved', 'dateImported', 'dateLastOpened'] as const)(
  'keeps folders first when selecting %s and reversing direction', (key) => {
    const { rerender } = renderWithLocalization(list(key, 'asc'));
    expect(titles().slice(0, 2)).toEqual(key === 'name' || key === 'dateLastOpened'
      ? ['B folder', 'Z folder'] : ['Z folder', 'B folder']);
    rerender(list(key, 'desc'));
    expect(titles().slice(0, 2)).toEqual(key === 'name'
      ? ['Z folder', 'B folder'] : ['B folder', 'Z folder']);
    expect(titles().slice(2)).toEqual(key === 'name'
      ? ['Y document', 'A document'] : ['A document', 'Y document']);
  }
);

it('preserves mixed manual order and mixed aggregate sorting', () => {
  const { rerender } = renderWithLocalization(list('manual', 'asc'));
  expect(titles()).toEqual(children.map((entry) => entry.title));
  rerender(list('name', 'asc', false));
  expect(titles()).toEqual(['A document', 'B folder', 'Y document', 'Z folder']);
});

it.each(['parent', 'nested'] as const)('groups folders in the mobile directory at %s', (parentId) => {
  const entries = children.map((entry) => ({ ...entry, parentNodeId: parentId }));
  const containers = parentId === 'parent' ? [parent] : [parent, { ...parent, id: 'nested', parentNodeId: 'parent' }];
  const snapshot = {
    activeNodeId: null, nodeOrder: [...containers, ...entries].map((entry) => entry.id),
    nodesById: Object.fromEntries([...containers, ...entries].map((entry) => [entry.id, entry])),
    trashedNodeIds: [], untitledSequenceByParent: {}
  } as WorkspaceSnapshot;
  for (const direction of ['asc', 'desc'] as const) {
    const result = resolveCompanionFolderViewByNodeId(snapshot, parentId, 'name', direction);
    expect(result?.items.map((entry) => entry.nodeId)).toEqual(direction === 'asc'
      ? ['folder-a', 'folder-z', 'doc-a', 'doc-z'] : ['folder-z', 'folder-a', 'doc-z', 'doc-a']);
  }
});
