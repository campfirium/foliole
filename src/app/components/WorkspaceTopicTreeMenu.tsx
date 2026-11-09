import { useState } from 'react';

import type { NodeListContextMenuController } from '../../features/nodes/components/NodeListTreeHooks';
import { NodeListTreeMenu } from '../../features/nodes/components/NodeListTreeMenu';
import type { NodeSelectModifiers } from '../../features/nodes/components/NodeListTreeState';
import { NodeReviewSchedulingDialog } from '../../features/nodes/components/NodeReviewSchedulingDialog';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { getCurrentReviewSchedulerSettings } from '../../features/settings/model/reviewSchedulerSettings';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { AddToVirtualFolderDialog } from './AddToVirtualFolderDialog';
import { requestClipboardImport } from './importActivityRequests';
import type { useWorkspaceTopicTreeInteraction } from './useWorkspaceTopicTreeInteraction';
import { useWorkspaceAddToDive } from './WorkspaceAddToDive';
import type { WorkspaceTopicTreeProps } from './WorkspaceTopicTree';
import type { useWorkspaceTopicTreeActions } from './workspaceTopicTreeActions';
import { listAvailableManualVirtualFolders } from './workspaceVirtualFolderMembership';

interface WorkspaceTopicTreeMenuProps {
  actions: ReturnType<typeof useWorkspaceTopicTreeActions>;
  activeFolderId: string;
  contextMenu: NodeListContextMenuController;
  handleSelectNode: (nodeId: string, modifiers?: NodeSelectModifiers) => void;
  virtualFolderView?: 'manual' | 'readonly';
  getDiveTopicRemoval?: (sourceIds: string[]) => (() => void) | undefined;
  nodesById: WorkspaceListNodesById;
  onCreateChildNode: ReturnType<typeof useWorkspaceTopicTreeActions>['createChildNode'];
  onOpenMoveToNode: WorkspaceTopicTreeProps['onOpenMoveToNode'];
  onOpenPostponeTopicPanel?: WorkspaceTopicTreeProps['onOpenPostponeTopicPanel'];
  topicTreeState: ReturnType<typeof useWorkspaceTopicTreeInteraction>['topicTreeState'];
}

function hasAvailableVirtualFolder(sourceIds: string[]) {
  const workspace = useWorkspaceStore.getState();
  return listAvailableManualVirtualFolders({
    nodeOrder: workspace.nodeOrder,
    nodesById: workspace.nodesById,
    sourceIds
  }).length > 0;
}

function createRemoveFromCurrentVirtualFolder(props: WorkspaceTopicTreeMenuProps) {
  if (props.virtualFolderView !== 'manual') return undefined;
  const directIds = props.nodesById[props.activeFolderId]?.manualChildOrder ?? [];
  if (!props.contextMenu.getContextTargets().some(id => directIds.includes(id))) return undefined;
  return (nodeIds: string[]) => {
    const removedIds = new Set(nodeIds);
    props.actions.setFolderManualChildOrder?.(
      props.activeFolderId,
      (props.nodesById[props.activeFolderId]?.manualChildOrder ?? []).filter((nodeId) => !removedIds.has(nodeId))
    );
  };
}

function resolveReferencedFolderNames(props: WorkspaceTopicTreeMenuProps, targets: string[]) {
  if (props.virtualFolderView !== 'manual' || targets.length !== 1) return [];
  const directIds = new Set(props.nodesById[props.activeFolderId]?.manualChildOrder ?? []);
  const folders: string[] = [];
  const visited = new Set<string>();
  let parentId = props.nodesById[targets[0]!]?.parentNodeId;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = props.nodesById[parentId];
    if (parent?.kind !== 'folder' || parent.specialKind) break;
    if (directIds.has(parentId)) folders.push(parent.title);
    parentId = parent.parentNodeId;
  }
  return folders;
}

function resolveMembershipMenuProps(
  props: WorkspaceTopicTreeMenuProps,
  targets: string[],
  t: ReturnType<typeof useTranslation>
) {
  const removeFromDive = props.getDiveTopicRemoval?.(targets);
  if (removeFromDive) return {
    removeMembershipLabel: 'desktop.nodeList.menu.removeFromDive' as const,
    onRemoveFromCurrentVirtualFolder: removeFromDive
  };
  const remove = createRemoveFromCurrentVirtualFolder(props);
  const folders = resolveReferencedFolderNames(props, targets);
  return {
    ...(remove ? { onRemoveFromCurrentVirtualFolder: remove } : {}),
    ...(folders.length ? {
      removeMembershipLabel: 'desktop.nodeList.menu.removeDirectVirtualReference' as const,
      membershipSourceLabel: t('desktop.nodeList.menu.virtualFolderSources', {
        folders: folders.join(t('desktop.nodeList.menu.virtualFolderSourceSeparator'))
      })
    } : {})
  };
}

export function WorkspaceTopicTreeMenu(props: WorkspaceTopicTreeMenuProps) {
  const [reviewSchedulingNodeId, setReviewSchedulingNodeId] = useState<string | null>(null);
  const [addToVirtualFolderTopicIds, setAddToVirtualFolderTopicIds] = useState<string[] | null>(null);
  const t = useTranslation();
  const addToDive = useWorkspaceAddToDive();
  const targets = props.contextMenu.getContextTargets();
  const canAddToVirtualFolder = hasAvailableVirtualFolder(targets);
  return (
    <>
      <NodeListTreeMenu
        contextMenu={props.contextMenu}
        createMenuSurface={props.virtualFolderView ? 'virtual-topics' : 'topics'}
        createChildNode={props.onCreateChildNode}
        createGlobalNode={(content = '', kind = 'topic') => props.onCreateChildNode(props.activeFolderId, content, kind)}
        createVirtualNode={props.actions.createVirtualNode}
        deleteNodes={props.actions.deleteNodes}
        deleteNodesPermanently={props.actions.deleteNodesPermanently}
        dismissNode={props.actions.dismissNode}
        dismissNodes={props.actions.dismissNodes}
        isVirtualViewOpen={false}
        nodesById={props.nodesById}
        onCreateTopicFromClipboard={(parentNodeId) =>
          requestClipboardImport({ targetParentNodeId: parentNodeId ?? props.activeFolderId })
        }
        onOpenMoveToNode={props.onOpenMoveToNode}
        {...(addToDive.open ? { onAddToDive: addToDive.open } : {})}
        {...(canAddToVirtualFolder ? { onAddToVirtualFolder: setAddToVirtualFolderTopicIds } : {})}
        {...resolveMembershipMenuProps(props, targets, t)}
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
        defaultDesiredRetention={getCurrentReviewSchedulerSettings().desiredRetention}
        defaultPriority={getCurrentReviewSchedulerSettings().pushQueue.defaultPriority}
        node={reviewSchedulingNodeId ? (props.nodesById[reviewSchedulingNodeId] ?? null) : null}
        nodesById={props.nodesById}
        onClose={() => setReviewSchedulingNodeId(null)}
        onDesiredRetentionChange={props.actions.updateNodeDesiredRetention}
        onPriorityChange={props.actions.updateNodePriority}
        onShortTermChange={props.actions.updateNodeShortTerm}
      />
      {addToDive.dialog}
      {addToVirtualFolderTopicIds ? (
        <AddToVirtualFolderDialog
          onClose={() => setAddToVirtualFolderTopicIds(null)}
          sourceIds={addToVirtualFolderTopicIds}
        />
      ) : null}
    </>
  );
}
