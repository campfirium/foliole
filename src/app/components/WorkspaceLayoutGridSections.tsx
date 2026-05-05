import { memo } from 'react';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID } from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import type {
  RuntimeExternalSearchBrowseEntry,
  RuntimeExternalSearchFolder
} from '../../shared/platform/externalSearchBridge';

import type { ExternalLibrarySelection } from './externalLibraryBrowseModel';
import { WorkspaceDocumentSurface } from './WorkspaceDocumentSurface';
import type { WorkspaceDocumentSurfaceProps } from './workspaceDocumentSurfaceProps';
import { WorkspaceDualListContent } from './WorkspaceDualListContent';
import { WorkspaceListEmptyState, WorkspaceListLoadingState } from './WorkspaceListStates';

export interface WorkspaceListAreaProps {
  activeNodeId: string | null;
  activeVirtualNodeId: string | null;
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  isExternalViewOpen: boolean;
  isWorkspaceHydrated?: boolean;
  listNodesById: WorkspaceListNodesById;
  nodesById: Record<string, Node>;
  nodeOrder: string[];
  onOpenMoveToNode: () => void;
  onOpenNotesView: () => void;
  onOpenExternalSelection: (selection: ExternalLibrarySelection) => void;
  onOpenExternalLibrarySettings: () => void;
  onOpenTrashView: () => void;
  onOpenVirtualView: (nodeId?: string) => void;
  onSelectNode: (nodeId: string) => void;
  onSelectNodeInVirtualView: (nodeId: string) => void;
  onSelectTrashNode: (nodeId: string) => void;
  selectedTrashNodeId: string | null;
  trashedNodeIds: string[];
  externalEntriesByFolderId: Record<string, RuntimeExternalSearchBrowseEntry[] | undefined>;
  externalFolders: RuntimeExternalSearchFolder[];
  externalSelection: ExternalLibrarySelection;
}

function shouldShowWorkspaceEmptyState(args: {
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  isExternalViewOpen: boolean;
  isWorkspaceHydrated?: boolean;
  nodeOrder: string[];
  trashedNodeIds: string[];
}) {
  const hasVisibleWorkspaceNodes = args.nodeOrder.some(
    (nodeId) =>
      nodeId !== INBOX_NODE_ID &&
      nodeId !== VIRTUAL_ROOT_NODE_ID &&
      !args.trashedNodeIds.includes(nodeId)
  );

  return (
    Boolean(
      args.isWorkspaceHydrated &&
      !args.isTrashViewOpen &&
      !args.isVirtualViewOpen &&
      !args.isExternalViewOpen &&
      !hasVisibleWorkspaceNodes
    )
  );
}

export const WorkspaceListArea = memo(function WorkspaceListArea({
  activeNodeId,
  activeVirtualNodeId,
  isTrashViewOpen,
  isVirtualViewOpen,
  isExternalViewOpen,
  isWorkspaceHydrated,
  listNodesById,
  nodesById,
  nodeOrder,
  onOpenMoveToNode,
  onOpenNotesView,
  onOpenExternalSelection,
  onOpenExternalLibrarySettings,
  onOpenTrashView,
  onOpenVirtualView,
  onSelectNode,
  onSelectNodeInVirtualView,
  onSelectTrashNode,
  selectedTrashNodeId,
  trashedNodeIds,
  externalEntriesByFolderId,
  externalFolders,
  externalSelection
}: WorkspaceListAreaProps) {
  const shouldShowEmptyState = shouldShowWorkspaceEmptyState({ isTrashViewOpen, isVirtualViewOpen, isExternalViewOpen, isWorkspaceHydrated, nodeOrder, trashedNodeIds });

  return (
    <div className="workspace-region-main-folder flex min-h-0 flex-1 flex-col overflow-hidden text-foreground">
      {renderWorkspaceListBody({
        activeNodeId,
        activeVirtualNodeId,
        externalEntriesByFolderId,
        externalFolders,
        externalSelection,
        isExternalViewOpen,
        isTrashViewOpen,
        isVirtualViewOpen,
        isWorkspaceHydrated,
        listNodesById,
        nodesById,
        nodeOrder,
        onOpenMoveToNode,
        onOpenNotesView,
        onOpenExternalSelection,
        onOpenExternalLibrarySettings,
        onOpenTrashView,
        onOpenVirtualView,
        onSelectNode,
        onSelectNodeInVirtualView,
        onSelectTrashNode,
        selectedTrashNodeId,
        shouldShowEmptyState,
        trashedNodeIds
      })}
    </div>
  );
});

function renderWorkspaceListBody(
  props: Pick<
    WorkspaceListAreaProps,
    | 'activeNodeId'
    | 'activeVirtualNodeId'
    | 'externalEntriesByFolderId'
    | 'externalFolders'
    | 'externalSelection'
    | 'isExternalViewOpen'
    | 'isTrashViewOpen'
    | 'isVirtualViewOpen'
    | 'isWorkspaceHydrated'
    | 'listNodesById'
    | 'nodesById'
    | 'nodeOrder'
    | 'onOpenMoveToNode'
    | 'onOpenNotesView'
    | 'onOpenExternalSelection'
    | 'onOpenExternalLibrarySettings'
    | 'onOpenTrashView'
    | 'onOpenVirtualView'
    | 'onSelectNode'
    | 'onSelectNodeInVirtualView'
    | 'onSelectTrashNode'
    | 'selectedTrashNodeId'
    | 'trashedNodeIds'
  > & { shouldShowEmptyState: boolean }
) {
  if (!props.isWorkspaceHydrated) {
    return <WorkspaceListLoadingState />;
  }
  if (props.shouldShowEmptyState) {
    return <WorkspaceListEmptyState />;
  }
  return renderWorkspaceDualListBody(props);
}

function renderWorkspaceDualListBody(
  props: Pick<
    WorkspaceListAreaProps,
    | 'activeNodeId'
    | 'activeVirtualNodeId'
    | 'externalEntriesByFolderId'
    | 'externalFolders'
    | 'externalSelection'
    | 'isExternalViewOpen'
    | 'isTrashViewOpen'
    | 'isVirtualViewOpen'
    | 'listNodesById'
    | 'nodesById'
    | 'nodeOrder'
    | 'onOpenMoveToNode'
    | 'onOpenNotesView'
    | 'onOpenExternalSelection'
    | 'onOpenExternalLibrarySettings'
    | 'onOpenTrashView'
    | 'onOpenVirtualView'
    | 'onSelectNode'
    | 'onSelectNodeInVirtualView'
    | 'onSelectTrashNode'
    | 'selectedTrashNodeId'
    | 'trashedNodeIds'
  >
) {
  return (
    <WorkspaceDualListContent
      activeNodeId={props.activeNodeId}
      activeVirtualNodeId={props.activeVirtualNodeId}
      externalEntriesByFolderId={props.externalEntriesByFolderId}
      externalFolders={props.externalFolders}
      externalSelection={props.externalSelection}
      isExternalViewOpen={props.isExternalViewOpen}
      isTrashViewOpen={props.isTrashViewOpen}
      isVirtualViewOpen={props.isVirtualViewOpen}
      listNodesById={props.listNodesById}
      nodesById={props.nodesById}
      nodeOrder={props.nodeOrder}
      onOpenMoveToNode={props.onOpenMoveToNode}
      onOpenNotesView={props.onOpenNotesView}
      onOpenExternalSelection={props.onOpenExternalSelection}
      onOpenExternalLibrarySettings={props.onOpenExternalLibrarySettings}
      onOpenTrashView={props.onOpenTrashView}
      onOpenVirtualView={props.onOpenVirtualView}
      onSelectNode={props.onSelectNode}
      onSelectNodeInVirtualView={props.onSelectNodeInVirtualView}
      onSelectTrashNode={props.onSelectTrashNode}
      selectedTrashNodeId={props.selectedTrashNodeId}
      trashedNodeIds={props.trashedNodeIds}
    />
  );
}

export const WorkspaceDocumentArea = memo(function WorkspaceDocumentArea({
  documentSurfaceProps
}: {
  documentSurfaceProps: WorkspaceDocumentSurfaceProps;
}) {
  return (
    <section aria-label="Document and review area" className="flex min-h-0 min-w-0 flex-1 flex-col gap-0">
      <WorkspaceDocumentSurface {...documentSurfaceProps} />
    </section>
  );
});
