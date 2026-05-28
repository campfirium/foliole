import { useState } from 'react';

import type { NodeListContextMenuController } from '../../features/nodes/components/NodeListTreeHooks';
import { NodeListTreeMenu } from '../../features/nodes/components/NodeListTreeMenu';
import type { NodeSelectModifiers } from '../../features/nodes/components/NodeListTreeState';
import { NodeReviewSchedulingDialog } from '../../features/nodes/components/NodeReviewSchedulingDialog';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { getCurrentReviewSchedulerSettings } from '../../features/settings/model/reviewSchedulerSettings';

import { requestClipboardImport } from './importActivityRequests';
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
  onOpenPostponeTopicPanel?: WorkspaceTopicTreeProps['onOpenPostponeTopicPanel'];
  topicTreeState: ReturnType<typeof useWorkspaceTopicTreeInteraction>['topicTreeState'];
}) {
  const [reviewSchedulingNodeId, setReviewSchedulingNodeId] = useState<string | null>(null);
  return (
    <>
      <NodeListTreeMenu
        contextMenu={props.contextMenu}
        createMenuSurface="topics"
        createChildNode={props.actions.createChildNode}
        createGlobalNode={(content = '', kind = 'topic') => props.actions.createChildNode(props.activeFolderId, content, kind)}
        createVirtualNode={props.actions.createVirtualNode}
        deleteNodes={props.actions.deleteNodes}
        deleteNodesPermanently={props.actions.deleteNodesPermanently}
        dismissNode={props.actions.dismissNode}
        isVirtualViewOpen={false}
        nodesById={props.nodesById}
        onCreateTopicFromClipboard={(parentNodeId) =>
          requestClipboardImport({ targetParentNodeId: parentNodeId ?? props.activeFolderId })
        }
        onOpenMoveToNode={props.onOpenMoveToNode}
        {...(props.onOpenPostponeTopicPanel ? { onOpenPostponeTopic: props.onOpenPostponeTopicPanel } : {})}
        onOpenReviewScheduling={setReviewSchedulingNodeId}
        onSelect={props.handleSelectNode}
        restoreNode={props.actions.restoreNode}
        returnNode={props.actions.returnNode}
        setNodeSequentialReading={props.actions.setNodeSequentialReading}
        shelveNode={props.actions.shelveNode}
        state={props.topicTreeState}
        unshelveNode={props.actions.unshelveNode}
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
