import { memo } from 'react';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID } from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import { WorkspaceDocumentSurface } from './WorkspaceDocumentSurface';
import { WorkspaceDualListContent } from './WorkspaceDualListContent';
import type { WorkspaceLayoutProps } from './WorkspaceLayout';
import { WorkspaceListEmptyState, WorkspaceListLoadingState } from './WorkspaceListStates';
import { WorkspaceSideToolbar } from './WorkspaceSideToolbar';

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
  onOpenMoveToNode: WorkspaceLayoutProps['onOpenMoveToNode'];
  onOpenNotesView: WorkspaceLayoutProps['onOpenNotesView'];
  onOpenExternalSelection: WorkspaceLayoutProps['onOpenExternalSelection'];
  onOpenTrashView: WorkspaceLayoutProps['onOpenTrashView'];
  onOpenVirtualView: WorkspaceLayoutProps['onOpenVirtualView'];
  onSelectNode: (nodeId: string) => void;
  onSelectNodeInVirtualView: (nodeId: string) => void;
  onSelectTrashNode: WorkspaceLayoutProps['onSelectTrashNode'];
  selectedTrashNodeId: string | null;
  trashedNodeIds: string[];
  externalEntriesByFolderId: WorkspaceLayoutProps['externalEntriesByFolderId'];
  externalFolders: WorkspaceLayoutProps['externalFolders'];
  externalSelection: WorkspaceLayoutProps['externalSelection'];
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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-bg-panel text-foreground">
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
  documentNodeId,
  isImmersiveEditing,
  onEnterImmersiveEdit,
  onShouldSuppressSelectionRestore,
  props
}: {
  documentNodeId: string | null;
  isImmersiveEditing: boolean;
  onEnterImmersiveEdit: () => void;
  onShouldSuppressSelectionRestore: () => boolean;
  props: WorkspaceLayoutProps;
}) {
  return (
    <section aria-label="Document and review area" className="flex min-h-0 min-w-0 flex-1 flex-col gap-0">
      <WorkspaceDocumentSurface
        documentNodeId={documentNodeId}
        isImmersiveEditing={isImmersiveEditing}
        onEnterImmersiveEdit={onEnterImmersiveEdit}
        onShouldSuppressSelectionRestore={onShouldSuppressSelectionRestore}
        props={props}
      />
    </section>
  );
});

export const WorkspaceLeftRail = memo(function WorkspaceLeftRail({
  isImportManagementOpen,
  onOpenImportManagement,
  onStartClipboardImport,
  onStartImport,
  showStudyDock,
  props
}: {
  isImportManagementOpen: boolean;
  onOpenImportManagement: () => void;
  onStartClipboardImport: () => void;
  onStartImport: () => void;
  showStudyDock?: boolean;
  props: WorkspaceLayoutProps;
}) {
  return (
    <div className="h-full bg-bg-panel max-[1080px]:hidden">
      <WorkspaceSideToolbar
        canStartStudyMode={props.canStartStudyMode}
        isImportManagementOpen={isImportManagementOpen}
        isSettingsOpen={props.isSettingsOpen}
        isStudyMode={props.isStudyMode}
        reviewDueCount={props.reviewDueCount}
        showStudyDock={showStudyDock}
        onOpenImportManagement={onOpenImportManagement}
        onOpenSettings={props.onOpenSettings}
        onStartClipboardImport={onStartClipboardImport}
        onStartImport={onStartImport}
        onToggleReviewSession={props.onToggleReviewSession}
      />
    </div>
  );
});
