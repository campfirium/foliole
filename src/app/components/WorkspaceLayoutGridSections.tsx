import { useMemo, useRef } from 'react';

import { NodeListHeader } from '../../features/nodes/components/NodeListHeader';
import { NodeListTree } from '../../features/nodes/components/NodeListTree';
import { INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID } from '../../features/nodes/model/specialNodes';
import {
  projectWorkspaceListNodesById,
  type WorkspaceListNodesById
} from '../../features/nodes/model/workspaceListNode';
import { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import { AppEmptyState } from '../../shared/ui';

import { DocumentPanelSection } from './DocumentPanelSection';
import { ReviewModeToolbar } from './ReviewModeToolbar';
import type { WorkspaceLayoutProps } from './WorkspaceLayout';
import { WorkspaceListStudyStatusBar } from './WorkspaceListStudyStatusBar';
import { WorkspaceSideToolbar } from './WorkspaceSideToolbar';

export function WorkspaceListArea({
  onSelectNode,
  props
}: {
  onSelectNode: (nodeId: string) => void;
  props: WorkspaceLayoutProps;
}) {
  const previousListNodesByIdRef = useRef<WorkspaceListNodesById>({});
  const listNodesById = useMemo(() => {
    const nextProjection = projectWorkspaceListNodesById(
      props.nodesById,
      previousListNodesByIdRef.current
    );
    previousListNodesByIdRef.current = nextProjection;
    return nextProjection;
  }, [props.nodesById]);
  const hasVisibleWorkspaceNodes = props.nodeOrder.some(
    (nodeId) =>
      nodeId !== INBOX_NODE_ID &&
      nodeId !== VIRTUAL_ROOT_NODE_ID &&
      !props.trashedNodeIds.includes(nodeId)
  );
  const shouldShowEmptyState =
    props.isWorkspaceHydrated &&
    !props.isTrashViewOpen &&
    !props.isVirtualViewOpen &&
    !hasVisibleWorkspaceNodes;

  return (
    <div className="flex min-h-0 flex-col overflow-hidden bg-bg-panel text-foreground">
      {!props.isWorkspaceHydrated ? (
        <WorkspaceListLoadingState />
      ) : shouldShowEmptyState ? (
        <WorkspaceListEmptyState />
      ) : (
        <NodeListTree
          activeNodeId={props.activeNodeId}
          isTrashViewOpen={props.isTrashViewOpen}
          isVirtualViewOpen={props.isVirtualViewOpen}
          nodeOrder={props.nodeOrder}
          nodesById={listNodesById}
          onOpenMoveToNode={props.onOpenMoveToNode}
          onOpenNotesView={props.onOpenNotesView}
          onSelectNode={onSelectNode}
          onSelectTrashNode={props.onSelectTrashNode}
          selectedTrashNodeId={props.selectedTrashNodeId}
        />
      )}
      <WorkspaceListStudyStatusBar
        isStudyMode={props.isStudyMode}
        reviewCompletedCount={props.reviewCompletedCount}
        reviewDueCount={props.reviewDueCount}
        reviewQueueCount={props.reviewQueueCount}
        reviewStatus={props.reviewStatus}
      />
    </div>
  );
}

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

export function WorkspaceDocumentArea({
  documentNodeId,
  props
}: {
  documentNodeId: string | null;
  props: WorkspaceLayoutProps;
}) {
  return (
    <section aria-label="Document and review area" className="flex min-h-0 min-w-0 flex-1 flex-col gap-0">
      <WorkspaceDocumentSurface documentNodeId={documentNodeId} props={props} />
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
    </section>
  );
}

function WorkspaceDocumentSurface({
  documentNodeId,
  props
}: {
  documentNodeId: string | null;
  props: WorkspaceLayoutProps;
}) {
  const { editorAppearanceKey } = useAppearanceSettings();

  return (
    <DocumentPanelSection
      activeNodeId={documentNodeId}
      isWorkspaceHydrated={props.isWorkspaceHydrated}
      canGoBack={props.canGoBack}
      canGoForward={props.canGoForward}
      canGoParent={props.canGoParent}
      contextMenu={props.contextMenu}
      documentMaxWidth={props.documentMaxWidth}
      editableNodeId={props.editorNodeId}
      editorAppearanceKey={editorAppearanceKey}
      editorContent={props.editorContent}
      editorNodeId={props.editorNodeId}
      editorNodeViewState={props.editorNodeViewState}
      isDocumentResizing={props.isDocumentResizing}
      isEditorReadOnly={props.isEditorReadOnly}
      isPriorityQuickSetActive={props.isPriorityQuickSetActive}
      nodeOrder={props.nodeOrder}
      nodesById={props.nodesById}
      onAnswerChange={props.onAnswerChange}
      onCloseContextMenu={props.onCloseContextMenu}
      onCopyImage={props.onCopyImage}
      onCreateCloze={props.onCreateCloze}
      onCreateHighlight={props.onCreateHighlight}
      onCreatePdfHighlight={props.onCreatePdfHighlight}
      onCutImage={props.onCutImage}
      onDeleteImage={props.onDeleteImage}
      onEditorChange={props.onEditorChange}
      onEditorContextMenu={props.onEditorContextMenu}
      onEditorReady={props.onEditorReady}
      onExportImage={props.onExportImage}
      onGoBack={props.onGoBack}
      onGoForward={props.onGoForward}
      onGoParent={props.onGoParent}
      onNodeContentChange={props.onNodeContentChange}
      onNodePriorityChange={props.onNodePriorityChange}
      onPersistPdfViewState={props.onPersistPdfViewState}
      onResetLayout={props.onResetLayout}
      onResolveDocumentPositionAtViewportY={props.onResolveDocumentPositionAtViewportY}
      onRevealDocumentPosition={props.onRevealDocumentPosition}
      onRevealDocumentSelection={props.onRevealDocumentSelection}
      onSelectBreadcrumbNode={props.onSelectBreadcrumbNode}
      onSelectNode={props.onSelectNode}
      onStartDocumentResize={props.onStartDocumentResize}
      priorityQuickSetShortcutLabel={props.priorityQuickSetShortcutLabel}
      reviewSchedulerSettings={props.reviewSchedulerSettings}
      showAnswerSection={props.showAnswerSection}
      trashedNodeIds={props.trashedNodeIds}
    />
  );
}

export function WorkspaceLeftRail({
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
}
