import type { CSSProperties, KeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { NodeListTree } from '../../features/nodes/components/NodeListTree';
import type { Node } from '../../features/nodes/model/nodeTypes';
import type { ReviewGrade } from '../../features/review/model/reviewTypes';
import { cn } from '../../lib/utils';
import type { NodeViewState } from '../../store/workspaceStore';
import type { ResizeSide } from '../hooks/useDocumentWidthResizer';

import { DocumentPanelSection } from './DocumentPanelSection';
import { ReviewModeToolbar } from './ReviewModeToolbar';
import { WindowTitleBar } from './WindowTitleBar';
import { WorkspaceToolbar } from './WorkspaceToolbar';

export interface WorkspaceEditorContextMenu {
  canRunCommands: boolean;
  left: number;
  top: number;
}

export interface WorkspaceLayoutProps {
  activeNodeId: string | null;
  canGoBack: boolean;
  canGoForward: boolean;
  canGoParent: boolean;
  contextMenu: WorkspaceEditorContextMenu | null;
  documentMaxWidth: number;
  editorContent: string;
  editorNodeId: string | null;
  editorNodeViewState?: NodeViewState;
  canStartStudyMode: boolean;
  isStudyMode: boolean;
  isAnswerRevealed: boolean;
  isDocumentResizing: boolean;
  isResizingList: boolean;
  isTrashViewOpen: boolean;
  isViewingTrashNode: boolean;
  showAnswerSection: boolean;
  listWidth: number;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  onAnswerChange: (answer: string) => void;
  onEditorChange: (content: string) => void;
  onEditorReady: (adapter: EditorAdapter | null) => void;
  onEditorContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onResetLayout: () => void;
  onSelectBreadcrumbNode: (nodeId: string) => void;
  onSelectNode: (nodeId: string) => void;
  onSelectTrashNode: (nodeId: string) => void;
  onSplitterKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onSplitterPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onOpenNotesView: () => void;
  onOpenTrashView: () => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onGoParent: () => void;
  onCloseContextMenu: () => void;
  onCreateHighlight: () => void;
  onCreateCloze: () => void;
  onStartDocumentResize: (
    side: ResizeSide,
    event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>
  ) => void;
  onStartStudyMode: () => void;
  onRevealAnswer: () => void;
  onGradeReview: (grade: ReviewGrade) => void;
  selectedTrashNodeId: string | null;
}

export function WorkspaceLayout({
  activeNodeId,
  canGoBack,
  canGoForward,
  canGoParent,
  contextMenu,
  documentMaxWidth,
  editorContent,
  editorNodeId,
  editorNodeViewState,
  canStartStudyMode,
  isStudyMode,
  isAnswerRevealed,
  isDocumentResizing,
  isResizingList,
  isTrashViewOpen,
  isViewingTrashNode,
  showAnswerSection,
  listWidth,
  nodeOrder,
  nodesById,
  onAnswerChange,
  onEditorChange,
  onEditorReady,
  onEditorContextMenu,
  onResetLayout,
  onSelectBreadcrumbNode,
  onSelectNode,
  onSelectTrashNode,
  onSplitterKeyDown,
  onSplitterPointerDown,
  onOpenNotesView,
  onOpenTrashView,
  onGoBack,
  onGoForward,
  onGoParent,
  onCloseContextMenu,
  onCreateHighlight,
  onCreateCloze,
  onStartDocumentResize,
  onStartStudyMode,
  onRevealAnswer,
  onGradeReview,
  selectedTrashNodeId
}: WorkspaceLayoutProps) {
  const workspaceGridStyle = {
    '--workspace-list-width': `${listWidth}px`
  } as CSSProperties;
  const documentNodeId = isViewingTrashNode ? selectedTrashNodeId : activeNodeId;

  return (
    <main aria-label="Foliole workspace" className="flex h-dvh flex-col overflow-hidden p-0">
      <WindowTitleBar />
      <WorkspaceToolbar
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        canGoParent={canGoParent}
        listWidth={listWidth}
        onGoBack={onGoBack}
        onGoForward={onGoForward}
        onGoParent={onGoParent}
      />
      <div
        className="grid min-h-0 flex-1 gap-0 overflow-hidden px-3 pb-3 pt-2 max-[1080px]:grid-cols-1 max-[1080px]:grid-rows-[minmax(0,38dvh)_minmax(0,1fr)]"
        data-resizing={isResizingList}
        style={{ ...workspaceGridStyle, gridTemplateColumns: 'minmax(0, var(--workspace-list-width, 300px)) 4px minmax(0, 1fr)' }}
      >
        <NodeListTree
          activeNodeId={activeNodeId}
          isTrashViewOpen={isTrashViewOpen}
          nodeOrder={nodeOrder}
          nodesById={nodesById}
          onOpenNotesView={onOpenNotesView}
          onOpenTrashView={onOpenTrashView}
          onSelectNode={onSelectNode}
          onSelectTrashNode={onSelectTrashNode}
          selectedTrashNodeId={selectedTrashNodeId}
        />
        <ListSplitter
          isResizingList={isResizingList}
          listWidth={listWidth}
          onResetLayout={onResetLayout}
          onSplitterKeyDown={onSplitterKeyDown}
          onSplitterPointerDown={onSplitterPointerDown}
        />
        <section aria-label="Document and review area" className="flex min-h-0 flex-1 flex-col gap-0">
          <DocumentPanelSection
            activeNodeId={documentNodeId}
            contextMenu={contextMenu}
            documentMaxWidth={documentMaxWidth}
            editorContent={editorContent}
            editorNodeId={editorNodeId}
            editorNodeViewState={editorNodeViewState}
            isDocumentResizing={isDocumentResizing}
            nodesById={nodesById}
            onAnswerChange={onAnswerChange}
            onCloseContextMenu={onCloseContextMenu}
            onCreateCloze={onCreateCloze}
            onCreateHighlight={onCreateHighlight}
            onEditorChange={onEditorChange}
            onEditorContextMenu={onEditorContextMenu}
            onEditorReady={onEditorReady}
            onResetLayout={onResetLayout}
            onSelectNode={onSelectBreadcrumbNode}
            onStartDocumentResize={onStartDocumentResize}
            showAnswerSection={showAnswerSection}
          />
          <ReviewModeToolbar
            canStartStudyMode={canStartStudyMode}
            isAnswerRevealed={isAnswerRevealed}
            isStudyMode={isStudyMode}
            onGrade={onGradeReview}
            onRevealAnswer={onRevealAnswer}
            onStartStudyMode={onStartStudyMode}
          />
        </section>
      </div>
    </main>
  );
}

interface ListSplitterProps {
  isResizingList: boolean;
  listWidth: number;
  onResetLayout: () => void;
  onSplitterKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onSplitterPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

function ListSplitter({
  isResizingList,
  listWidth,
  onResetLayout,
  onSplitterKeyDown,
  onSplitterPointerDown
}: ListSplitterProps) {
  return (
    <div
      aria-label="Resize node list"
      aria-orientation="vertical"
      aria-valuenow={Math.round(listWidth)}
      className="group relative self-stretch max-[1080px]:hidden"
      onDoubleClick={onResetLayout}
      onKeyDown={onSplitterKeyDown}
      onPointerDown={onSplitterPointerDown}
      role="separator"
      tabIndex={0}
    >
      <span
        className={cn(
          'pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 border-l border-border opacity-50 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100',
          isResizingList && 'w-px border-l border-border-strong opacity-100'
        )}
      />
    </div>
  );
}
