import { NodeListTree } from '../../features/nodes/components/NodeListTree';

import { DocumentPanelSection } from './DocumentPanelSection';
import { ImportSourceWorkspace } from './ImportSourceWorkspace';
import { ReviewModeToolbar } from './ReviewModeToolbar';
import type { WorkspaceLayoutProps } from './WorkspaceLayout';
import { WorkspaceListSplitter } from './WorkspaceListSplitter';
import { WorkspaceRightSidebar } from './WorkspaceRightSidebar';
import { WorkspaceRightSidebarSplitter } from './WorkspaceRightSidebarSplitter';
import { WorkspaceSideToolbar } from './WorkspaceSideToolbar';
import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

function getWorkspaceGridColumns(props: WorkspaceLayoutProps) {
  if (props.isListCollapsed && props.isRightSidebarCollapsed) {
    return 'grid-cols-1 xl:grid-cols-1';
  }
  if (props.isListCollapsed) {
    return 'grid-cols-1 xl:[grid-template-columns:minmax(0,1fr)_1px_minmax(0,var(--workspace-right-sidebar-width,320px))]';
  }
  if (props.isRightSidebarCollapsed) {
    return '[grid-template-columns:minmax(0,var(--workspace-list-width,300px))_1px_minmax(0,1fr)] xl:[grid-template-columns:minmax(0,var(--workspace-list-width,300px))_1px_minmax(0,1fr)]';
  }
  return '[grid-template-columns:minmax(0,var(--workspace-list-width,300px))_1px_minmax(0,1fr)] xl:[grid-template-columns:minmax(0,var(--workspace-list-width,300px))_1px_minmax(0,1fr)_1px_minmax(0,var(--workspace-right-sidebar-width,320px))]';
}

function getReviewStatusLabel(status: WorkspaceLayoutProps['reviewStatus']) {
  if (status === 'awaiting-answer') {
    return 'Awaiting answer';
  }
  if (status === 'answer-revealed') {
    return 'Answer revealed';
  }
  return 'Session complete';
}

function ListStudyStatusBar({
  isStudyMode,
  reviewDueCount,
  reviewQueueCount,
  reviewCompletedCount,
  reviewStatus
}: {
  isStudyMode: boolean;
  reviewDueCount: number;
  reviewQueueCount: number;
  reviewCompletedCount: number;
  reviewStatus: WorkspaceLayoutProps['reviewStatus'];
}) {
  if (!isStudyMode) {
    return null;
  }

  return (
    <div className="flex h-[56px] flex-none items-center border-t border-border bg-bg-panel px-3">
      <p className="truncate text-xs font-medium text-foreground/70">
        Reviewing · {Math.max(reviewQueueCount, 0)} left · {Math.max(reviewCompletedCount, 0)} done · {getReviewStatusLabel(reviewStatus)}
        {' · '}
        {Math.max(reviewDueCount, 0)} due now
      </p>
    </div>
  );
}

function WorkspaceListArea({ onSelectNode, props }: { onSelectNode: (nodeId: string) => void; props: WorkspaceLayoutProps }) {
  return (
    <div className="flex min-h-0 flex-col overflow-hidden bg-bg-panel text-foreground">
      <NodeListTree
        activeNodeId={props.activeNodeId}
        isTrashViewOpen={props.isTrashViewOpen}
        nodeOrder={props.nodeOrder}
        nodesById={props.nodesById}
        onOpenNotesView={props.onOpenNotesView}
        onSelectNode={onSelectNode}
        onSelectTrashNode={props.onSelectTrashNode}
        selectedTrashNodeId={props.selectedTrashNodeId}
      />
      <ListStudyStatusBar
        isStudyMode={props.isStudyMode}
        reviewCompletedCount={props.reviewCompletedCount}
        reviewDueCount={props.reviewDueCount}
        reviewQueueCount={props.reviewQueueCount}
        reviewStatus={props.reviewStatus}
      />
    </div>
  );
}

function WorkspaceDocumentArea({
  documentNodeId,
  isImportManagementOpen,
  props
}: {
  documentNodeId: string | null;
  isImportManagementOpen: boolean;
  props: WorkspaceLayoutProps;
}) {
  return (
    <section aria-label="Document and review area" className="flex min-h-0 min-w-0 flex-1 flex-col gap-0">
      <WorkspaceDocumentSurface documentNodeId={documentNodeId} isImportManagementOpen={isImportManagementOpen} props={props} />
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
  isImportManagementOpen,
  props
}: {
  documentNodeId: string | null;
  isImportManagementOpen: boolean;
  props: WorkspaceLayoutProps;
}) {
  if (isImportManagementOpen) {
    return <ImportSourceWorkspace />;
  }

  return (
    <DocumentPanelSection
      activeNodeId={documentNodeId}
      canGoBack={props.canGoBack}
      canGoForward={props.canGoForward}
      canGoParent={props.canGoParent}
      contextMenu={props.contextMenu}
      documentMaxWidth={props.documentMaxWidth}
      editableNodeId={props.editorNodeId}
      editorAppearanceKey={`${props.markdownSyntaxVisibility}-${props.editorDisplayMode}`}
      editorContent={props.editorContent}
      editorDisplayMode={props.editorDisplayMode}
      editorNodeId={props.editorNodeId}
      editorNodeViewState={props.editorNodeViewState}
      isDocumentResizing={props.isDocumentResizing}
      nodesById={props.nodesById}
      onAnswerChange={props.onAnswerChange}
      onCloseContextMenu={props.onCloseContextMenu}
      onCreateCloze={props.onCreateCloze}
      onCreateHighlight={props.onCreateHighlight}
      onEditorChange={props.onEditorChange}
      onEditorContextMenu={props.onEditorContextMenu}
      onEditorReady={props.onEditorReady}
      onGoBack={props.onGoBack}
      onGoForward={props.onGoForward}
      onGoParent={props.onGoParent}
      onResetLayout={props.onResetLayout}
      onSelectNode={props.onSelectBreadcrumbNode}
      onStartDocumentResize={props.onStartDocumentResize}
      onToggleEditorDisplayMode={props.onToggleEditorDisplayMode}
      showAnswerSection={props.showAnswerSection}
    />
  );
}

function WorkspaceLeftRail({
  isImportManagementOpen,
  onOpenImportManagement,
  props
}: {
  isImportManagementOpen: boolean;
  onOpenImportManagement: () => void;
  props: WorkspaceLayoutProps;
}) {
  return (
    <div className="h-full bg-[#f6f6f6] max-[1080px]:hidden">
      <WorkspaceSideToolbar
        canStartStudyMode={props.canStartStudyMode}
        isImportManagementOpen={isImportManagementOpen}
        isStudyMode={props.isStudyMode}
        isSettingsOpen={props.isSettingsOpen}
        reviewDueCount={props.reviewDueCount}
        onOpenImportManagement={onOpenImportManagement}
        onOpenSettings={props.onOpenSettings}
        onToggleReviewSession={props.onToggleReviewSession}
      />
    </div>
  );
}

export function WorkspaceLayoutGrid({
  activeRightPanelId,
  documentNodeId,
  isImportManagementOpen,
  onOpenImportManagement,
  onSelectNode,
  props
}: {
  activeRightPanelId: WorkspaceRightPanelId;
  documentNodeId: string | null;
  isImportManagementOpen: boolean;
  onOpenImportManagement: () => void;
  onSelectNode: (nodeId: string) => void;
  props: WorkspaceLayoutProps;
}) {
  return (
    <div className="grid min-h-0 flex-1 overflow-hidden max-[1080px]:[grid-template-columns:minmax(0,1fr)]" style={{ gridTemplateColumns: '40px minmax(0, 1fr)' }}>
      <WorkspaceLeftRail isImportManagementOpen={isImportManagementOpen} onOpenImportManagement={onOpenImportManagement} props={props} />
      <div className="col-start-2 min-h-0 min-w-0 overflow-hidden max-[1080px]:col-start-1">
        <div
          className={`grid h-full min-h-0 gap-0 overflow-hidden ${getWorkspaceGridColumns(props)} max-[1080px]:grid-cols-1 max-[1080px]:grid-rows-[minmax(0,38dvh)_minmax(0,1fr)]`}
          data-resizing={props.isResizingList || props.isResizingRightSidebar}
        >
          {!props.isListCollapsed ? <WorkspaceListArea onSelectNode={onSelectNode} props={props} /> : null}
          {!props.isListCollapsed ? (
            <WorkspaceListSplitter
              isResizingList={props.isResizingList}
              listWidth={props.listWidth}
              onResetLayout={props.onResetLayout}
              onSplitterKeyDown={props.onSplitterKeyDown}
              onSplitterPointerDown={props.onSplitterPointerDown}
            />
          ) : null}
          <WorkspaceDocumentArea documentNodeId={documentNodeId} isImportManagementOpen={isImportManagementOpen} props={props} />
          {!props.isRightSidebarCollapsed ? (
            <WorkspaceRightSidebarSplitter
              isResizingRightSidebar={props.isResizingRightSidebar}
              onResetLayout={props.onResetLayout}
              onRightSidebarSplitterKeyDown={props.onRightSidebarSplitterKeyDown}
              onRightSidebarSplitterPointerDown={props.onRightSidebarSplitterPointerDown}
              rightSidebarWidth={props.rightSidebarWidth}
            />
          ) : null}
          {!props.isRightSidebarCollapsed ? (
            <WorkspaceRightSidebar
              activePanelId={activeRightPanelId}
              activeNodeId={documentNodeId}
              nodesById={props.nodesById}
              reviewCurrentNodeId={props.reviewCurrentNodeId}
              reviewQueueNodeIds={props.reviewPanelQueueNodeIds}
              reviewSchedulerSettings={props.reviewSchedulerSettings}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
