import { useMemo } from 'react';

import { DIVE_SECTION_ROW_ID, type Dive } from '../../../lib/core/nodes/dive';
import type { Node } from '../../features/nodes/model/nodeTypes';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { collectDiveMembershipTopicIds, resolveDiveMembership } from '../../shared/diveMembership';
import { definedProps } from '../../shared/lib/definedProps';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import type { WorkspaceCanonicalSource } from '../../shared/workspaceCanonicalSelectors';

import { removeWorkspaceDiveSource } from './workspaceDiveMutation';
import { WorkspaceTopicTree } from './WorkspaceTopicTree';

export function WorkspaceDiveContent(props: {
  activeNodeId: string | null;
  continueAfterDelete: boolean;
  forceVisibleNodeId?: string | null;
  childrenByParent: Map<string | null, string[]>;
  nodesById: WorkspaceListNodesById;
  workspace: WorkspaceCanonicalSource<Node> & { trashedNodeIds: readonly string[] };
  onSelectNode: (id: string) => void;
} & ({ dive: Dive; dives?: never } | { dive?: never; dives: readonly Dive[] })) {
  const { childrenByParent, dive, dives, nodesById } = props;
  const { nodeOrder, nodesById: workspaceNodes, trashedNodeIds } = props.workspace;
  const t = useTranslation();
  const ids = useMemo(
    () => {
      const workspace = { nodeOrder, nodesById: workspaceNodes, trashedNodeIds };
      if (dive) return resolveDiveMembership(workspace, dive).topics;
      return collectDiveMembershipTopicIds(workspace, dives);
    },
    [dive, dives, nodeOrder, workspaceNodes, trashedNodeIds]
  );

  return (
    <WorkspaceTopicTree
      activeFolderId={dive ? `dive:${dive.id}` : DIVE_SECTION_ROW_ID}
      activeNodeId={props.activeNodeId}
      childrenByParent={childrenByParent}
      {...definedProps({ deleteBrowseRootId: props.continueAfterDelete ? dive?.id : undefined })}
      emptyState={{ title: t('desktop.nodeList.dive.empty'), description: t('desktop.nodeList.dive.emptyDescription') }}
      {...definedProps({ forceVisibleNodeId: props.forceVisibleNodeId })}
      getDiveTopicRemoval={([topicId, ...otherIds]) => {
        if (!topicId || otherIds.length || !dive?.directSourceIds.includes(topicId)) return undefined;
        return () => void removeWorkspaceDiveSource(dive.id, topicId, t('desktop.nodeList.addToDive.saveFailed'));
      }}
      itemIds={ids}
      nodesById={nodesById}
      onOpenMoveToNode={() => undefined}
      onSelectNode={props.onSelectNode}
      preserveItemOrder={!dive}
      showCreateTopic={false}
      topicFocusAvailable={false}
      virtualFolderView="readonly"
    />
  );
}
