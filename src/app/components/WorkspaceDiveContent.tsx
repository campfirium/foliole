import { useMemo } from 'react';

import type { Dive } from '../../../lib/core/nodes/dive';
import type { Node } from '../../features/nodes/model/nodeTypes';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { resolveDiveMembership } from '../../shared/diveMembership';
import { definedProps } from '../../shared/lib/definedProps';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import type { WorkspaceCanonicalSource } from '../../shared/workspaceCanonicalSelectors';

import { removeWorkspaceDiveSource } from './workspaceDiveMutation';
import { WorkspaceTopicTree } from './WorkspaceTopicTree';

export function WorkspaceDiveContent(props: {
  dive: Dive;
  activeNodeId: string | null;
  forceVisibleNodeId?: string | null;
  childrenByParent: Map<string | null, string[]>;
  nodesById: WorkspaceListNodesById;
  workspace: WorkspaceCanonicalSource<Node> & { trashedNodeIds: readonly string[] };
  onSelectNode: (id: string) => void;
}) {
  const { childrenByParent, dive, nodesById } = props;
  const { nodeOrder, nodesById: workspaceNodes, trashedNodeIds } = props.workspace;
  const t = useTranslation();
  const ids = useMemo(
    () => resolveDiveMembership({ nodeOrder, nodesById: workspaceNodes, trashedNodeIds }, dive).topics,
    [dive, nodeOrder, workspaceNodes, trashedNodeIds]
  );

  return (
    <WorkspaceTopicTree
      activeFolderId={`dive:${dive.id}`}
      activeNodeId={props.activeNodeId}
      childrenByParent={childrenByParent}
      emptyState={{ title: t('desktop.nodeList.dive.empty'), description: t('desktop.nodeList.dive.emptyDescription') }}
      {...definedProps({ forceVisibleNodeId: props.forceVisibleNodeId })}
      getDiveTopicRemoval={([topicId, ...otherIds]) => {
        if (!topicId || otherIds.length || !dive.directSourceIds.includes(topicId)) return undefined;
        return () => void removeWorkspaceDiveSource(dive.id, topicId, t('desktop.nodeList.addToDive.saveFailed'));
      }}
      itemIds={ids}
      nodesById={nodesById}
      onOpenMoveToNode={() => undefined}
      onSelectNode={props.onSelectNode}
      showCreateTopic={false}
      topicFocusAvailable={false}
      virtualFolderView="readonly"
    />
  );
}
