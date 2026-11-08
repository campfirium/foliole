import { useContext, useMemo } from 'react';

import { resolveDiveTopicIds, type Dive } from '../../../lib/core/nodes/dive';
import { isVirtualNode, isVirtualRootNode } from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppButton } from '../../shared/ui';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { DiveFlowActionContext } from './diveFlowActionContext';
import { WorkspaceTopicTree } from './WorkspaceTopicTree';

const flatChildren = new Map<string | null, string[]>();

export function WorkspaceDiveContent(props: {
  dive: Dive;
  activeNodeId: string | null;
  childrenByParent: ReadonlyMap<string | null, readonly string[]>;
  nodesById: WorkspaceListNodesById;
  visibleNodeIds: ReadonlySet<string>;
  onSelectNode: (id: string) => void;
}) {
  const { childrenByParent, dive, nodesById, visibleNodeIds } = props;
  const t = useTranslation();
  const openFlow = useContext(DiveFlowActionContext);
  const activeDiveId = useWorkspaceStore(state => state.reviewSession.dive?.id);
  const inThisDive = activeDiveId === dive.id;
  const ids = useMemo(() => resolveDiveTopicIds(dive, {
    kindOf: (id) => {
      const node = nodesById[id];
      return visibleNodeIds.has(id) && !node?.anchorLink && !isVirtualNode(node) && !isVirtualRootNode(node) ? node?.kind : undefined;
    },
    childrenOf: (id) => childrenByParent.get(id) ?? []
  }), [childrenByParent, dive, nodesById, visibleNodeIds]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {openFlow ? (
        <div className="px-4 py-1">
          <AppButton size="sm" onClick={() => void openFlow(inThisDive ? null : { id: dive.id, topicIds: ids })}>
            {t(inThisDive ? 'desktop.nodeList.dive.returnToFlow' : 'desktop.nodeList.dive.startFlow')}
          </AppButton>
        </div>
      ) : null}
      <WorkspaceTopicTree
        activeFolderId={`dive:${dive.id}`}
        activeNodeId={props.activeNodeId}
        childrenByParent={flatChildren}
        emptyState={{ title: t('desktop.nodeList.dive.empty'), description: t('desktop.nodeList.dive.emptyDescription') }}
        headerDescription={dive.title}
        itemIds={ids}
        nodesById={nodesById}
        onOpenMoveToNode={() => undefined}
        onSelectNode={props.onSelectNode}
        showCreateTopic={false}
        topicFocusAvailable={false}
        virtualFolderView="readonly"
      />
    </div>
  );
}
