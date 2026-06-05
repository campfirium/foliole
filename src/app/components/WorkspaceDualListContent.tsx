import { useCallback, useMemo, useRef } from 'react';

import { NodeListTree } from '../../features/nodes/components/NodeListTree';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { buildVirtualNodeResultIndex } from '../../features/nodes/model/virtualNodeDetail';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { definedProps } from '../../shared/lib/definedProps';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import type {
  ExternalLibraryBrowseEntry,
  ExternalLibraryFolder
} from '../../shared/platform/externalLibraryBrowseRepository';

import type { ExternalLibrarySelection } from './externalLibraryBrowseModel';
import { TrashResultListPanel } from './TrashResultListPanel';
import { WorkspaceCollectionSurface } from './WorkspaceCollectionSurface';
import { renderExternalContentColumn } from './workspaceDualListExternalContent';
import { WorkspaceDualListFolderColumn } from './WorkspaceDualListFolderColumn';
import { useWorkspaceDualListState } from './workspaceDualListState';
import { useWorkspaceDualListViewRoot } from './workspaceDualListViewRoot';
import { renderVirtualContentColumn } from './workspaceDualListVirtualContent';
import { useWorkspaceRenderDiagnostic } from './workspaceInputLagRenderDiagnostic';
import type { WorkspaceLayoutFlatProps } from './workspaceLayoutProps';
import { WorkspaceTopicTree } from './WorkspaceTopicTree';

export interface WorkspaceDualListContentProps {
  activeNodeId: string | null;
  activeVirtualNodeId?: string | null;
  externalEntriesByFolderId: Record<string, ExternalLibraryBrowseEntry[] | undefined>;
  externalFolders: ExternalLibraryFolder[];
  externalSelection: ExternalLibrarySelection;
  isExternalViewOpen: boolean;
  isStudyMode: boolean;
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  listNodesById: WorkspaceListNodesById;
  nodesById: Record<string, Node>;
  nodeOrder: string[];
  onOpenMoveToNode: WorkspaceLayoutFlatProps['onOpenMoveToNode'];
  onOpenPostponeTopicPanel?: WorkspaceLayoutFlatProps['onOpenPostponeTopicPanel'];
  onOpenNotesView: () => void;
  onOpenExternalSelection: (selection: ExternalLibrarySelection) => void;
  onOpenExternalLibrarySettings?: () => void;
  onOpenTrashView: () => void;
  onOpenVirtualView?: (nodeId?: string) => void;
  onSelectNode: (nodeId: string) => void;
  onSelectNodeInVirtualView: (nodeId: string) => void;
  onSelectTrashNode: (nodeId: string) => void;
  reviewCurrentNodeId: string | null;
  selectedTrashNodeId: string | null;
  trashedNodeIds: string[];
}

function renderSingleListFallback(props: WorkspaceDualListContentProps) {
  return (
    <NodeListTree
      activeNodeId={props.activeNodeId}
      isTrashViewOpen={props.isTrashViewOpen}
      isVirtualViewOpen={props.isVirtualViewOpen}
      nodeOrder={props.nodeOrder}
      nodesById={props.listNodesById}
      onOpenMoveToNode={props.onOpenMoveToNode}
      onOpenNotesView={props.onOpenNotesView}
      onSelectNode={props.onSelectNode}
      onSelectTrashNode={props.onSelectTrashNode}
      selectedTrashNodeId={props.selectedTrashNodeId}
    />
  );
}

function renderStandardContentColumn(
  props: WorkspaceDualListContentProps,
  dualListState: ReturnType<typeof useWorkspaceDualListState>,
  topicRootId: string,
  topicCallbacks: ReturnType<typeof useWorkspaceTopicTreeCallbacks>
) {
  if (props.isTrashViewOpen) {
    return (
      <TrashResultListPanel
        nodeOrder={props.nodeOrder}
        nodesById={props.listNodesById}
        onSelectTrashNode={props.onSelectTrashNode}
        selectedTrashNodeId={props.selectedTrashNodeId}
        trashedNodeIds={props.trashedNodeIds}
      />
    );
  }

  return (
    <WorkspaceTopicTree
      activeFolderId={topicRootId}
      activeNodeId={props.activeNodeId}
      childrenByParent={dualListState.topicChildrenByParent}
      forceVisibleNodeId={props.isStudyMode ? props.reviewCurrentNodeId : null}
      itemIds={dualListState.topicNodeOrder}
      nodesById={dualListState.topicNodesById}
      onOpenMoveToNode={topicCallbacks.onOpenMoveToNode}
      {...definedProps({ onOpenPostponeTopicPanel: topicCallbacks.onOpenPostponeTopicPanel })}
      onSelectNode={topicCallbacks.onSelectNode}
    />
  );
}

function useWorkspaceTopicTreeCallbacks(props: WorkspaceDualListContentProps) {
  const propsRef = useRef(props);
  propsRef.current = props;
  const onOpenMoveToNode = useCallback(() => propsRef.current.onOpenMoveToNode(), []);
  const onOpenPostponeTopicPanel = useCallback(
    (nodeId: string) => propsRef.current.onOpenPostponeTopicPanel?.(nodeId),
    []
  );
  const onSelectNode = useCallback((nodeId: string) => propsRef.current.onSelectNode(nodeId), []);
  return useMemo(
    () => ({
      onOpenMoveToNode,
      onOpenPostponeTopicPanel: props.onOpenPostponeTopicPanel ? onOpenPostponeTopicPanel : undefined,
      onSelectNode
    }),
    [onOpenMoveToNode, onOpenPostponeTopicPanel, onSelectNode, props.onOpenPostponeTopicPanel]
  );
}

export function WorkspaceDualListContent(props: WorkspaceDualListContentProps) {
  const t = useTranslation();
  useWorkspaceRenderDiagnostic('workspace-dual-list-content-render', {
    activeNodeId: props.activeNodeId,
    listNodesById: props.listNodesById,
    nodeOrder: props.nodeOrder,
    nodesById: props.nodesById,
    reviewCurrentNodeId: props.reviewCurrentNodeId,
    trashedNodeIds: props.trashedNodeIds
  });
  const viewRoot = useWorkspaceDualListViewRoot(props);
  const dualListState = useWorkspaceDualListState({
    ...props,
    preferredFolderColumnId: viewRoot.preferredFolderColumnId
  });
  const topicRootId = dualListState.activeFolderColumnId ?? dualListState.activeFolderId ?? null;
  const topicCallbacks = useWorkspaceTopicTreeCallbacks(props);
  const virtualResultIndex = useMemo(
    () => buildVirtualNodeResultIndex(props),
    [props.nodeOrder, props.nodesById, props.trashedNodeIds]
  );

  if (!topicRootId && !props.isVirtualViewOpen && !props.isExternalViewOpen) {
    return renderSingleListFallback(props);
  }

  return (
    <WorkspaceCollectionSurface
      folderColumn={
        <WorkspaceDualListFolderColumn
          dualListState={dualListState}
          onSelectFolderColumnNode={viewRoot.selectFolderColumnNode}
          props={props}
          virtualResultCountById={virtualResultIndex.countById}
        />
      }
      contentColumn={
        props.isVirtualViewOpen
          ? renderVirtualContentColumn(props, virtualResultIndex, t)
            : props.isExternalViewOpen
              ? renderExternalContentColumn(props)
              : topicRootId
              ? renderStandardContentColumn(props, dualListState, topicRootId, topicCallbacks)
            : renderSingleListFallback(props)
      }
    />
  );
}
