import { memo } from 'react';

import { NodeListHeader } from '../../features/nodes/components/NodeListHeader';
import { INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID } from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import { AppEmptyState } from '../../shared/ui';

import { DocumentPanelSection } from './DocumentPanelSection';
import { ReviewModeToolbar } from './ReviewModeToolbar';
import { buildDocumentSectionProps } from './workspaceDocumentSectionProps';
import { WorkspaceDualListContent } from './WorkspaceDualListContent';
import type { WorkspaceLayoutProps } from './WorkspaceLayout';
import { WorkspaceListStudyStatusBar } from './WorkspaceListStudyStatusBar';
import { WorkspaceSideToolbar } from './WorkspaceSideToolbar';

export interface WorkspaceListAreaProps {
  activeNodeId: string | null;
  isStudyMode: boolean;
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  isWorkspaceHydrated?: boolean;
  listNodesById: WorkspaceListNodesById;
  nodeOrder: string[];
  onOpenMoveToNode: WorkspaceLayoutProps['onOpenMoveToNode'];
  onOpenNotesView: WorkspaceLayoutProps['onOpenNotesView'];
  onSelectNode: (nodeId: string) => void;
  onSelectTrashNode: WorkspaceLayoutProps['onSelectTrashNode'];
  reviewCompletedCount: number;
  reviewDueCount: number;
  reviewQueueCount: number;
  reviewStatus: WorkspaceLayoutProps['reviewStatus'];
  selectedTrashNodeId: string | null;
  trashedNodeIds: string[];
}

function shouldShowWorkspaceEmptyState(args: {
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
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
    args.isWorkspaceHydrated &&
    !args.isTrashViewOpen &&
    !args.isVirtualViewOpen &&
    !hasVisibleWorkspaceNodes
  );
}

export const WorkspaceListArea = memo(function WorkspaceListArea({
  activeNodeId,
  isStudyMode,
  isTrashViewOpen,
  isVirtualViewOpen,
  isWorkspaceHydrated,
  listNodesById,
  nodeOrder,
  onOpenMoveToNode,
  onOpenNotesView,
  onSelectNode,
  onSelectTrashNode,
  reviewCompletedCount,
  reviewDueCount,
  reviewQueueCount,
  reviewStatus,
  selectedTrashNodeId,
  trashedNodeIds
}: WorkspaceListAreaProps) {
  const shouldShowEmptyState = shouldShowWorkspaceEmptyState({
    isTrashViewOpen,
    isVirtualViewOpen,
    isWorkspaceHydrated,
    nodeOrder,
    trashedNodeIds
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-bg-panel text-foreground">
      {!isWorkspaceHydrated ? (
        <WorkspaceListLoadingState />
      ) : shouldShowEmptyState ? (
        <WorkspaceListEmptyState />
      ) : (
        <WorkspaceDualListContent
          activeNodeId={activeNodeId}
          isTrashViewOpen={isTrashViewOpen}
          isVirtualViewOpen={isVirtualViewOpen}
          listNodesById={listNodesById}
          nodeOrder={nodeOrder}
          onOpenMoveToNode={onOpenMoveToNode}
          onOpenNotesView={onOpenNotesView}
          onSelectNode={onSelectNode}
          onSelectTrashNode={onSelectTrashNode}
          selectedTrashNodeId={selectedTrashNodeId}
          trashedNodeIds={trashedNodeIds}
        />
      )}
      <WorkspaceListStudyStatusBar
        isStudyMode={isStudyMode}
        reviewCompletedCount={reviewCompletedCount}
        reviewDueCount={reviewDueCount}
        reviewQueueCount={reviewQueueCount}
        reviewStatus={reviewStatus}
      />
    </div>
  );
});

function WorkspaceListLoadingState() {
  return (
    <aside
      aria-busy="true"
      aria-label="Loading note list"
      className="flex min-h-0 flex-1 flex-col bg-bg-panel text-foreground"
    >
      <NodeListHeader
        isTrashViewOpen={false}
        isVirtualViewOpen={false}
        onCollapseAll={() => undefined}
        onCreateCommand={() => undefined}
        onEmptyTrash={() => undefined}
        onExpandAll={() => undefined}
        onOpenNotesView={() => undefined}
        onSearchQueryChange={() => undefined}
        searchQuery=""
        trashCount={0}
      />
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <div
            aria-label="Loading note list indicator"
            className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-foreground/55"
          />
          <p className="m-0 text-sm text-foreground/65">Loading notes</p>
        </div>
      </div>
    </aside>
  );
}

function WorkspaceListEmptyState() {
  return (
    <aside aria-label="Node list panel" className="flex min-h-0 flex-1 flex-col bg-bg-panel text-foreground">
      <div className="flex min-h-[40px] items-center justify-end gap-2 px-3">
        <div className="h-8 w-8 rounded-sm bg-foreground/[0.05]" />
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-8">
        <AppEmptyState
          description="Create your first note from the list toolbar to start writing."
          title="No notes yet"
        />
      </div>
    </aside>
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
      {props.isImmersiveMode ? null : (
        <ReviewModeToolbar
          isAnswerRevealed={props.isAnswerRevealed}
          isCurrentItemGradable={props.isCurrentReviewItemGradable}
          isReviewEditing={props.isReviewEditing}
          isStudyMode={props.isStudyMode}
          reviewPreview={props.reviewPreview}
          reviewCurrentNodeId={props.reviewCurrentNodeId}
          reviewQueueVisibility={props.reviewQueueVisibility}
          onCompleteReviewItem={props.onCompleteReviewItem}
          onDeferReviewItem={props.onDeferReviewItem}
          onDismissReviewItem={props.onDismissReviewItem}
          onExitReviewMode={props.onExitReviewMode}
          onGrade={props.onGradeReview}
          onRevealAnswer={props.onRevealAnswer}
        />
      )}
    </section>
  );
});

function WorkspaceDocumentSurface({
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
  const { editorAppearanceKey } = useAppearanceSettings();
  return (
    <DocumentPanelSection
      {...buildDocumentSectionProps(documentNodeId, editorAppearanceKey, isImmersiveEditing, onShouldSuppressSelectionRestore, props)}
      onEnterImmersiveEdit={onEnterImmersiveEdit}
    />
  );
}

export const WorkspaceLeftRail = memo(function WorkspaceLeftRail({
  isImportManagementOpen,
  onOpenImportManagement,
  onStartClipboardImport,
  onStartImport,
  props
}: {
  isImportManagementOpen: boolean;
  onOpenImportManagement: () => void;
  onStartClipboardImport: () => void;
  onStartImport: () => void;
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
        onOpenImportManagement={onOpenImportManagement}
        onOpenSettings={props.onOpenSettings}
        onStartClipboardImport={onStartClipboardImport}
        onStartImport={onStartImport}
        onToggleReviewSession={props.onToggleReviewSession}
      />
    </div>
  );
});
