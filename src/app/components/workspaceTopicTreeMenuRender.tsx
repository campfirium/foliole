import { useNodeListContextMenu } from '../../features/nodes/components/NodeListTreeHooks';
import type { NodeListState } from '../../features/nodes/components/NodeListTreeState';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { definedProps } from '../../shared/lib/definedProps';

import { useWorkspaceTopicTreeActions } from './workspaceTopicTreeActions';
import { WorkspaceTopicTreeMenu } from './WorkspaceTopicTreeMenu';
import { useWorkspaceTopicTreeSelection } from './workspaceTopicTreeSelection';

export function renderWorkspaceTopicTreeMenu(args: {
  actions: ReturnType<typeof useWorkspaceTopicTreeActions>;
  activeFolderId: string;
  contextMenu: ReturnType<typeof useNodeListContextMenu>;
  handleSelectNode: ReturnType<typeof useWorkspaceTopicTreeSelection>['handleSelectNode'];
  nodesById: WorkspaceListNodesById;
  onCreateChildNode: ReturnType<typeof useWorkspaceTopicTreeActions>['createChildNode'];
  onOpenMoveToNode: () => void;
  onOpenPostponeTopicPanel?: (nodeId: string) => void;
  topicTreeState: NodeListState;
}) {
  return (
    <WorkspaceTopicTreeMenu
      actions={args.actions}
      activeFolderId={args.activeFolderId}
      contextMenu={args.contextMenu}
      handleSelectNode={args.handleSelectNode}
      nodesById={args.nodesById}
      onCreateChildNode={args.onCreateChildNode}
      onOpenMoveToNode={args.onOpenMoveToNode}
      {...definedProps({ onOpenPostponeTopicPanel: args.onOpenPostponeTopicPanel })}
      topicTreeState={args.topicTreeState}
    />
  );
}
