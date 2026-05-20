import { useState } from 'react';

import type { NodeListContextMenuController } from '../../features/nodes/components/NodeListTreeHooks';
import { NodeListTreeMenu } from '../../features/nodes/components/NodeListTreeMenu';
import type { NodeSelectModifiers } from '../../features/nodes/components/NodeListTreeState';
import { NodeReviewSchedulingDialog } from '../../features/nodes/components/NodeReviewSchedulingDialog';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { getCurrentReviewSchedulerSettings } from '../../features/settings/model/reviewSchedulerSettings';

import type { useWorkspaceTopicTreeActions } from './WorkspaceTopicTree';
import type { WorkspaceTopicTreeProps } from './WorkspaceTopicTree';
import type { useWorkspaceTopicTreeInteraction } from './WorkspaceTopicTree';

export function WorkspaceTopicTreeMenu(props: {
  actions: ReturnType<typeof useWorkspaceTopicTreeActions>;
  activeFolderId: string;
  contextMenu: NodeListContextMenuController;
  handleSelectNode: (nodeId: string, modifiers?: NodeSelectModifiers) => void;
  nodesById: WorkspaceListNodesById;
  onOpenMoveToNode: WorkspaceTopicTreeProps['onOpenMoveToNode'];
  topicTreeState: ReturnType<typeof useWorkspaceTopicTreeInteraction>['topicTreeState'];
}) {
  const [reviewSchedulingNodeId, setReviewSchedulingNodeId] = useState<string | null>(null);
  return (
    <>
      <NodeListTreeMenu
        contextMenu={props.contextMenu}
        createChildNode={props.actions.createChildNode}
        createGlobalNode={(content = '', kind = 'topic') => props.actions.createChildNode(props.activeFolderId, content, kind)}
        createVirtualNode={props.actions.createVirtualNode}
        deleteNodes={props.actions.deleteNodes}
        deleteNodesPermanently={props.actions.deleteNodesPermanently}
        dismissNode={props.actions.dismissNode}
        isVirtualViewOpen={false}
        nodesById={props.nodesById}
        onOpenMoveToNode={props.onOpenMoveToNode}
        onOpenReviewScheduling={setReviewSchedulingNodeId}
        onSelect={props.handleSelectNode}
        restoreNode={props.actions.restoreNode}
        returnNode={props.actions.returnNode}
        state={props.topicTreeState}
      />
      <NodeReviewSchedulingDialog
        defaultPriority={getCurrentReviewSchedulerSettings().pushQueue.defaultPriority}
        node={reviewSchedulingNodeId ? (props.nodesById[reviewSchedulingNodeId] ?? null) : null}
        nodesById={props.nodesById}
        onClose={() => setReviewSchedulingNodeId(null)}
        onPriorityChange={props.actions.updateNodePriority}
        onShortTermChange={props.actions.updateNodeShortTerm}
      />
    </>
  );
}
