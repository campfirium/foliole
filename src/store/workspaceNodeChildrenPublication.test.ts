import { afterEach, expect, it } from 'vitest';

import { prepareWorkspaceNodeChildrenIndex as prepare } from '../features/nodes/model/workspaceNodeChildrenIndex';

import { collectNodeSubtreeIds } from './workspaceHelpers';
import { useWorkspaceStore } from './workspaceStore';
import { createWorkspaceStorePersistConfig } from './workspaceStorePersistConfig';

const original = useWorkspaceStore.getState();
afterEach(() => { useWorkspaceStore.setState(original, true); });

function publishFixture() {
  const base = original.nodesById['node-1']!;
  useWorkspaceStore.setState({ nodesById: { ...original.nodesById,
    parent: { ...base, id: 'parent', parentNodeId: null, kind: 'folder' },
    a: { ...base, id: 'a', parentNodeId: 'parent', kind: 'folder' },
    b: { ...base, id: 'b', parentNodeId: 'parent', kind: 'folder' },
    deep: { ...base, id: 'deep', parentNodeId: 'a', kind: 'folder' } },
  nodeOrder: [...original.nodeOrder, 'parent', 'a', 'b', 'deep'], libraryScope: 'first' });
  return useWorkspaceStore.getState();
}

it('prepares the final store map, reuses content changes and preserves old maps after external moves', () => {
  const first = publishFixture();
  const index = prepare(first.nodesById);
  useWorkspaceStore.setState({ nodesById: { ...first.nodesById,
    a: { ...first.nodesById.a!, content: 'External saved body' } } });
  const content = useWorkspaceStore.getState();
  expect(prepare(content.nodesById)).toBe(index);
  useWorkspaceStore.setState({ nodesById: { ...content.nodesById,
    deep: { ...content.nodesById.deep!, parentNodeId: 'b' } } });
  const moved = useWorkspaceStore.getState();
  expect(collectNodeSubtreeIds('a', moved.nodesById)).toEqual(['a']);
  expect(collectNodeSubtreeIds('b', moved.nodesById)).toEqual(['b', 'deep']);
  expect(collectNodeSubtreeIds('a', first.nodesById)).toEqual(['a', 'deep']);
  expect(prepare(moved.nodesById).children.get(null)).toBe(index.children.get(null));
});

it('reuses relations across pure order and tombstone publications, including hidden children', () => {
  const first = publishFixture();
  const index = prepare(first.nodesById);
  useWorkspaceStore.setState({ nodeOrder: [...first.nodeOrder].reverse(), trashedNodeIds: ['a', 'deep'],
    trashedNodeDeletedAtById: { a: '2026-10-28', deep: '2026-10-28' } });
  const hidden = useWorkspaceStore.getState();
  expect(prepare(hidden.nodesById)).toBe(index);
  expect(collectNodeSubtreeIds('parent', hidden.nodesById)).toEqual(['parent', 'a', 'b', 'deep']);
});

it('hydrates a second library with identical ids and different parent relations', () => {
  const first = publishFixture();
  const merge = createWorkspaceStorePersistConfig(() => undefined).merge!;
  const hydrated = merge({ ...first, libraryScope: 'second', nodesById: { ...first.nodesById,
    deep: { ...first.nodesById.deep!, parentNodeId: 'b', updatedAt: '2030-01-01T00:00:00Z' } } },
  { ...first, isHydrated: false });
  expect(hydrated.nodesById.deep?.parentNodeId).toBe('b');
  useWorkspaceStore.setState(hydrated, true);
  const current = useWorkspaceStore.getState();
  expect(current.libraryScope).toBe('second');
  expect(collectNodeSubtreeIds('a', current.nodesById)).toEqual(['a']);
  expect(collectNodeSubtreeIds('b', current.nodesById)).toEqual(['b', 'deep']);
  expect(collectNodeSubtreeIds('a', first.nodesById)).toEqual(['a', 'deep']);
});
