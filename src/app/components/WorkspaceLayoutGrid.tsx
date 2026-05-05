import { useMemo } from 'react';

import { NodeListTree } from '../../features/nodes/components/NodeListTree';
import { toWorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';

import { DocumentPanelSection } from './DocumentPanelSection';
import { ReviewModeToolbar } from './ReviewModeToolbar';
import type { WorkspaceLayoutProps } from './WorkspaceLayout';
import { WorkspaceListSplitter } from './WorkspaceListSplitter';
import { WorkspaceListStudyStatusBar } from './WorkspaceListStudyStatusBar';
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
function WorkspaceListArea({ onSelectNode, props }: { onSelectNode: (nodeId: string) => void; props: WorkspaceLayoutProps }) {
  const listNodesById = useMemo(() => toWorkspaceListNodesById(props.nodesById), [props.nodesById]);

  return (
    <div className="flex min-h-0 flex-col overflow-hidden bg-bg-panel text-foreground">
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
function WorkspaceDocumentArea({ documentNodeId, props }: { documentNodeId: string | null; props: WorkspaceLayoutProps }) {
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

function WorkspaceDocumentSurface({ documentNodeId, props }: { documentNodeId: string | null; props: WorkspaceLayoutProps }) {
  const { editorAppearanceKey } = useAppearanceSettings();

  return (
    <DocumentPanelSection
      activeNodeId={documentNodeId}
      canGoBack={props.canGoBack}
      canGoForward={props.canGoForward}
      canGoParent={props.canGoParent}
      contextMenu={props.contextMenu}
      documentMaxWidth={props.documentMaxWidth}
      editableNodeId={props.editorNodeId}
      editorAppearanceKey={editorAppearanceKey}
      editorContent={props.editorContent}
      isEditorReadOnly={props.isEditorReadOnly}
      editorNodeId={props.editorNodeId}
      editorNodeViewState={props.editorNodeViewState}
      isDocumentResizing={props.isDocumentResizing}
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
      onNodeContentChange={props.onNodeContentChange}
      onEditorContextMenu={props.onEditorContextMenu}
      onEditorReady={props.onEditorReady}
      onExportImage={props.onExportImage}
      onGoBack={props.onGoBack}
      onGoForward={props.onGoForward}
      onGoParent={props.onGoParent}
      onResetLayout={props.onResetLayout}
      onResolveDocumentPositionAtViewportY={props.onResolveDocumentPositionAtViewportY}
      onRevealDocumentPosition={props.onRevealDocumentPosition}
      onSelectNode={props.onSelectNode}
      onRevealDocumentSelection={props.onRevealDocumentSelection}
      onStartDocumentResize={props.onStartDocumentResize}
      showAnswerSection={props.showAnswerSection}
    />
  );
}
function WorkspaceLeftRail({
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
    <div className="h-full bg-[#f6f6f6] max-[1080px]:hidden">
      <WorkspaceSideToolbar
        canStartStudyMode={props.canStartStudyMode}
        isImportManagementOpen={isImportManagementOpen}
        isStudyMode={props.isStudyMode}
        isSettingsOpen={props.isSettingsOpen}
        reviewDueCount={props.reviewDueCount}
        onOpenImportManagement={onOpenImportManagement}
        onStartClipboardImport={onStartClipboardImport}
        onStartImport={onStartImport}
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
  onStartClipboardImport,
  onStartImport,
  onSelectNode,
  props
}: {
  activeRightPanelId: WorkspaceRightPanelId;
  documentNodeId: string | null;
  isImportManagementOpen: boolean;
  onOpenImportManagement: () => void;
  onStartClipboardImport: () => void;
  onStartImport: () => void;
  onSelectNode: (nodeId: string) => void;
  props: WorkspaceLayoutProps;
}) {
  return (
    <div className="grid min-h-0 flex-1 overflow-hidden max-[1080px]:[grid-template-columns:minmax(0,1fr)]" style={{ gridTemplateColumns: '40px minmax(0, 1fr)' }}>
      <WorkspaceLeftRail
        isImportManagementOpen={isImportManagementOpen}
        onOpenImportManagement={onOpenImportManagement}
        onStartClipboardImport={onStartClipboardImport}
        onStartImport={onStartImport}
        props={props}
      />
      <WorkspaceGridContent activeRightPanelId={activeRightPanelId} documentNodeId={documentNodeId} onSelectNode={onSelectNode} props={props} />
    </div>
  );
}

function WorkspaceGridContent({
  activeRightPanelId,
  documentNodeId,
  onSelectNode,
  props
}: {
  activeRightPanelId: WorkspaceRightPanelId;
  documentNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  props: WorkspaceLayoutProps;
}) {
  return (
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
        <WorkspaceDocumentArea documentNodeId={documentNodeId} props={props} />
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
            nodeOrder={props.nodeOrder}
            trashedNodeIds={props.trashedNodeIds}
            nodesById={props.nodesById}
            onSelectNode={onSelectNode}
            onRevealAnchorInDocument={props.onRevealAnchorInDocument}
            reviewCurrentNodeId={props.reviewCurrentNodeId}
            reviewQueueNodeIds={props.reviewPanelQueueNodeIds}
            reviewSchedulerSettings={props.reviewSchedulerSettings}
          />
        ) : null}
      </div>
    </div>
  );
}
