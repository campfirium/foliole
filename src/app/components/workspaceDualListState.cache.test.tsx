import { renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { projectWorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import { useWorkspaceDualListState, type WorkspaceDualListStateArgs } from './workspaceDualListState';

function createNode(id: string, kind: 'folder' | 'topic', parentNodeId: string | null): Node {
  return {
    id,
    kind,
    parentNodeId,
    title: id,
    content: '',
    reveal: '',
    createdAt: '2026-10-27T00:00:00.000Z',
    updatedAt: '2026-10-27T00:00:00.000Z',
    reading: null,
    review: null
  } as Node;
}

function createProps() {
  const source = {
    folder: createNode('folder', 'folder', null),
    other: createNode('other', 'folder', null),
    topic: createNode('topic', 'topic', 'folder'),
    sentinel: createNode('sentinel', 'topic', 'other')
  };
  const props: WorkspaceDualListStateArgs = {
    activeNodeId: 'folder',
    isTrashViewOpen: false,
    listNodesById: projectWorkspaceListNodesById(source),
    nodeOrder: Object.keys(source),
    trashedNodeIds: []
  };
  return { props, source };
}

it('does not rescan unrelated structure after accepting a priority-only projection', () => {
  const { props, source } = createProps();
  let parentReads = 0;
  Object.defineProperty(props.listNodesById.sentinel, 'parentNodeId', {
    enumerable: true,
    get() {
      parentReads += 1;
      return 'other';
    }
  });
  const { result, rerender } = renderHook(useWorkspaceDualListState, { initialProps: props });
  const initialOrder = result.current.topicNodeOrder;
  const initialCounts = result.current.folderTopicCountById;
  const nextMap = projectWorkspaceListNodesById({
    ...source, topic: { ...source.topic, priority: 9 }
  }, props.listNodesById);
  expect(nextMap).not.toBe(props.listNodesById);
  const nextProps = { ...props, listNodesById: nextMap };

  parentReads = 0;
  rerender(nextProps);
  expect(parentReads).toBeGreaterThan(0);
  expect(result.current.topicNodesById.topic?.priority).toBe(9);
  expect(result.current.topicNodeOrder).toBe(initialOrder);
  expect(result.current.folderTopicCountById).toBe(initialCounts);

  parentReads = 0;
  rerender(nextProps);
  expect(parentReads).toBe(0);
  rerender({ ...nextProps, activeNodeId: 'topic' });
  expect(parentReads).toBe(0);
  expect(result.current.activeFolderColumnId).toBe('folder');
  expect(result.current.topicNodeOrder).toBe(initialOrder);
});

it('refreshes movement, order, trash and restoration after a nonstructural cache hit', () => {
  const { props, source } = createProps();
  const { result, rerender } = renderHook(useWorkspaceDualListState, { initialProps: props });
  const prioritySource = { ...source, topic: { ...source.topic, priority: 9 } };
  const priorityMap = projectWorkspaceListNodesById(prioritySource, props.listNodesById);
  rerender({ ...props, listNodesById: priorityMap });
  expect(result.current.topicNodeOrder).toEqual(['topic']);

  const movedMap = projectWorkspaceListNodesById({
    ...prioritySource, sentinel: { ...source.sentinel, parentNodeId: 'folder' }
  }, priorityMap);
  const movedProps = { ...props, listNodesById: movedMap };
  rerender(movedProps);
  expect(result.current.topicNodeOrder).toEqual(['topic', 'sentinel']);
  expect(result.current.folderTopicCountById.get('folder')).toBe(2);

  const reorderedProps = { ...movedProps, nodeOrder: ['folder', 'other', 'sentinel', 'topic'] };
  rerender(reorderedProps);
  expect(result.current.topicNodeOrder).toEqual(['sentinel', 'topic']);
  rerender({ ...reorderedProps, trashedNodeIds: ['sentinel'] });
  expect(result.current.topicNodeOrder).toEqual(['topic']);
  expect(result.current.folderTopicCountById.get('folder')).toBe(1);
  rerender(reorderedProps);
  expect(result.current.topicNodeOrder).toEqual(['sentinel', 'topic']);
  expect(result.current.folderTopicCountById.get('folder')).toBe(2);
});
