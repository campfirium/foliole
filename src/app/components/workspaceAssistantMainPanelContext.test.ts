import { expect, it } from 'vitest';

import { createCollectionVirtualNodeFilter } from '../../../lib/core/nodes/virtualNodeFilter';
import type { Node } from '../../features/nodes/model/nodeTypes';

import { resolveAssistantMainPanelWorkspaceContext } from './workspaceAssistantMainPanelContext';
import type { WorkspaceGridContentProjectionSource } from './workspaceGridContentProps';
import type { WorkspaceLayoutProps } from './workspaceLayoutGroupedProps';

it('projects a real Collection virtual node into the assistant context', () => {
  const virtual = createNode('virtual-uk', '英国公司注册流程', '', 'folder');
  virtual.specialKind = 'virtual';
  virtual.virtualFilter = createCollectionVirtualNodeFilter(virtual.title);
  const topic = createNode(
    'topic-a',
    'UK 公司卖的是可预测性不是低税',
    '---\ncollections:\n  - "英国公司注册流程"\n---\n英国公司不是典型低税方案。'
  );
  topic.collections = [virtual.title];
  const context = resolveAssistantMainPanelWorkspaceContext({
    props: createProjectionSource('virtual-uk', { 'virtual-uk': virtual, 'topic-a': topic }, ['virtual-uk', 'topic-a'])
  });

  expect(context).toMatchObject({
    activeNodeId: 'virtual-uk',
    activeTitle: '英国公司注册流程',
    folder: { childCount: 1 },
    scope: 'node'
  });
}, 15_000);

it('does not override assistant context outside virtual main panels', () => {
  expect(resolveAssistantMainPanelWorkspaceContext({
    props: createProjectionSource(null, {}, [], false)
  })).toBeUndefined();
});

function createProjectionSource(
  activeVirtualNodeId: string | null,
  nodesById: Record<string, Node>,
  nodeOrder: string[],
  isVirtualViewOpen = true
): Pick<WorkspaceGridContentProjectionSource, 'nodeList' | 'trash' | 'virtualView'> {
  return {
    nodeList: { nodeOrder, nodesById } as WorkspaceLayoutProps['nodeList'],
    trash: ({ trashedNodeIds: [] } as unknown) as WorkspaceLayoutProps['trash'],
    virtualView: { activeVirtualNodeId, isVirtualViewOpen, onOpenVirtualView: () => undefined }
  };
}

function createNode(id: string, title: string, content: string, kind: Node['kind'] = 'topic'): Node {
  return {
    bodyStatus: 'ready',
    content,
    createdAt: '2026-07-09T00:00:00.000Z',
    hasContent: content.length > 0,
    id,
    isTitleManual: true,
    kind,
    parentNodeId: kind === 'folder' ? 'special-virtual-root' : null,
    reveal: null,
    review: null,
    title,
    updatedAt: '2026-07-09T00:00:00.000Z'
  };
}
