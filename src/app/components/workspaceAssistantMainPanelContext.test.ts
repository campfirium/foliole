import { expect, it } from 'vitest';

import { createCollectionVirtualNodeFilter } from '../../../lib/core/nodes/virtualNodeFilter';
import type { Node } from '../../features/nodes/model/nodeTypes';

import { resolveAssistantMainPanelWorkspaceContext } from './workspaceAssistantMainPanelContext';
import type { WorkspaceGridContentProjectionSource } from './workspaceGridContentProps';
import type { WorkspaceLayoutProps } from './workspaceLayoutGroupedProps';
import { resolveAssistantTurnReferenceContext } from './workspaceRightSidebarAssistantReferenceContext';

it('projects a Collection virtual node identity into the assistant context', () => {
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
    scope: 'node'
  });
});

it.each([100, 1000, 10000])('builds the same virtual reference without reading %i material bodies', (size) => {
  const virtual = createNode('virtual', 'Collection', '', 'folder');
  virtual.specialKind = 'virtual';
  virtual.virtualFilter = createCollectionVirtualNodeFilter('Collection');
  let bodyReads = 0;
  const nodes = Object.fromEntries(Array.from({ length: size }, (_, index) => {
    const node = createNode(`topic-${index}`, `Topic ${index}`, '');
    Object.defineProperty(node, 'content', { get: () => {
      bodyReads += 1;
      return '---\ncollections: [Collection]\n---\nMaterial body';
    } });
    return [node.id, node];
  }));
  nodes.virtual = virtual;
  const override = resolveAssistantMainPanelWorkspaceContext({
    props: createProjectionSource('virtual', nodes, Object.keys(nodes))
  });
  const reference = resolveAssistantTurnReferenceContext({
    followCurrentMaterial: true,
    location: { type: 'workspace' },
    nodesById: nodes,
    workspaceContextOverride: override
  });
  expect(reference).toEqual({
    activeKind: 'folder', activeNodeId: 'virtual', activeTitle: 'Collection',
    path: ['Collection'], schemaVersion: 1, scope: 'node'
  });
  expect(bodyReads).toBe(0);
});

it('refreshes virtual references after a title change without reusing old summaries', () => {
  const node = createNode('virtual', 'Before', '', 'folder');
  const props = createProjectionSource('virtual', { virtual: node }, ['virtual']);
  expect(resolveAssistantMainPanelWorkspaceContext({ props })?.path).toEqual(['Before']);
  props.nodeList.nodesById = { virtual: { ...node, title: 'After' } };
  const override = resolveAssistantMainPanelWorkspaceContext({ props });
  expect(override?.path).toEqual(['After']);
  expect(resolveAssistantTurnReferenceContext({
    followCurrentMaterial: false, location: { type: 'workspace' },
    nodesById: props.nodeList.nodesById, workspaceContextOverride: override
  })).toEqual({ schemaVersion: 1, scope: 'workspace' });
});

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
