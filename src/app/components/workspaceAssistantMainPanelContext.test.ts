import { expect, it } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import type { WorkspaceManualVirtualCollection } from '../../store/workspaceStore';

import { toManualVirtualCollectionNodeId } from './manualVirtualCollectionModel';
import { resolveAssistantMainPanelWorkspaceContext } from './workspaceAssistantMainPanelContext';
import type { WorkspaceGridContentProjectionSource } from './workspaceGridContentProps';
import type { WorkspaceLayoutProps } from './workspaceLayoutGroupedProps';

it('projects visible manual collection items into the assistant workspace context', () => {
  const collection: WorkspaceManualVirtualCollection = {
    availableMaterialNodeIds: ['topic-a', 'topic-b'],
    description: '由 Memo 中 UK Ltd 相关卡片创建的流程集合。',
    id: 'uk-company-flow',
    itemCount: 2,
    title: '英国公司注册流程',
    updatedAt: '2026-07-09T00:00:00.000Z'
  };
  const context = resolveAssistantMainPanelWorkspaceContext({
    props: createProjectionSource({
      activeVirtualNodeId: toManualVirtualCollectionNodeId(collection.id),
      manualVirtualCollections: [collection],
      nodesById: {
        'topic-a': createNode({
          content: '英国公司不是典型低税方案。',
          id: 'topic-a',
          title: 'UK 公司卖的是可预测性不是低税'
        }),
        'topic-b': createNode({
          content: '金融和支付平台看的是公司注册文件。',
          id: 'topic-b',
          title: 'Wise、Stripe 和银行审核的是业务现实'
        })
      },
      nodeOrder: ['topic-b', 'topic-a']
    })
  });

  expect(context).toMatchObject({
    activeNodeId: 'manual-virtual:uk-company-flow',
    activeTitle: '英国公司注册流程',
    folder: {
      childCount: 2,
      children: [
        expect.objectContaining({
          nodeId: 'topic-a',
          preview: '英国公司不是典型低税方案。',
          title: 'UK 公司卖的是可预测性不是低税'
        }),
        expect.objectContaining({
          nodeId: 'topic-b',
          preview: '金融和支付平台看的是公司注册文件。',
          title: 'Wise、Stripe 和银行审核的是业务现实'
        })
      ]
    },
    scope: 'node'
  });
});

it('does not override assistant context outside virtual main panels', () => {
  expect(resolveAssistantMainPanelWorkspaceContext({
    props: createProjectionSource({
      activeVirtualNodeId: null,
      manualVirtualCollections: [],
      nodesById: {},
      nodeOrder: []
    }, false)
  })).toBeUndefined();
});

function createProjectionSource(args: {
  activeVirtualNodeId: string | null;
  manualVirtualCollections: WorkspaceManualVirtualCollection[];
  nodesById: Record<string, Node>;
  nodeOrder: string[];
}, isVirtualViewOpen = true): Pick<WorkspaceGridContentProjectionSource, 'nodeList' | 'trash' | 'virtualView'> {
  return {
    nodeList: {
      nodeOrder: args.nodeOrder,
      nodesById: args.nodesById
    } as WorkspaceLayoutProps['nodeList'],
    trash: ({
      trashedNodeIds: []
    } as unknown) as WorkspaceLayoutProps['trash'],
    virtualView: {
      activeVirtualNodeId: args.activeVirtualNodeId,
      isVirtualViewOpen,
      manualVirtualCollections: args.manualVirtualCollections
    } as WorkspaceLayoutProps['virtualView']
  };
}

function createNode(args: {
  content: string;
  id: string;
  title: string;
}): Node {
  return {
    bodyStatus: 'ready',
    content: args.content,
    createdAt: '2026-07-09T00:00:00.000Z',
    hasContent: true,
    id: args.id,
    isTitleManual: true,
    kind: 'topic',
    parentNodeId: null,
    reveal: null,
    review: null,
    title: args.title,
    updatedAt: '2026-07-09T00:00:00.000Z'
  };
}
