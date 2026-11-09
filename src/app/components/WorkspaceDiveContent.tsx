import { useMemo } from 'react';

import { resolveDiveTopicIds, type Dive } from '../../../lib/core/nodes/dive';
import { isVirtualNode, isVirtualRootNode } from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { useTranslation } from '../../shared/localization/LocalizationProvider';

import { removeWorkspaceDiveSource } from './workspaceDiveMutation';
import { WorkspaceTopicTree } from './WorkspaceTopicTree';

export function WorkspaceDiveContent(props: {
  dive: Dive;
  activeNodeId: string | null;
  childrenByParent: Map<string | null, string[]>;
  nodesById: WorkspaceListNodesById;
  visibleNodeIds: ReadonlySet<string>;
  onSelectNode: (id: string) => void;
}) {
  const { childrenByParent, dive, nodesById, visibleNodeIds } = props;
  const t = useTranslation();
  const ids = useMemo(() => resolveDiveTopicIds(dive, {
    kindOf: (id) => {
      const node = nodesById[id];
      return visibleNodeIds.has(id) && !node?.anchorLink && !isVirtualNode(node) && !isVirtualRootNode(node) ? node?.kind : undefined;
    },
    childrenOf: (id) => childrenByParent.get(id) ?? []
  }), [childrenByParent, dive, nodesById, visibleNodeIds]);

  return (
    <WorkspaceTopicTree
      activeFolderId={`dive:${dive.id}`}
      activeNodeId={props.activeNodeId}
      childrenByParent={childrenByParent}
      emptyState={{ title: t('desktop.nodeList.dive.empty'), description: t('desktop.nodeList.dive.emptyDescription') }}
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
