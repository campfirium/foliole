import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { EditorDisplayMode } from '../../features/editor/model/editorDisplayMode';
import type { Node } from '../../features/nodes/model/nodeTypes';
import type { ReviewSchedulerSettings } from '../../features/settings/model/reviewSchedulerSettings';
import type { NodeViewState } from '../../store/workspaceStore';
import type { ResizeSide } from '../hooks/useDocumentWidthResizer';

import { DocumentPanelBody } from './DocumentPanelBody';
import { DocumentPanelHeader } from './DocumentPanelHeader';
import { DocumentPanelNodeReviewSettings } from './DocumentPanelNodeReviewSettings';
import { EditorContextMenu } from './EditorContextMenu';
import type { WorkspaceEditorContextMenu } from './WorkspaceLayout';

interface DocumentPanelSectionProps {
  activeNodeId: string | null;
  editableNodeId: string | null;
  canGoBack: boolean;
  canGoForward: boolean;
  canGoParent: boolean;
  contextMenu: WorkspaceEditorContextMenu | null;
  documentMaxWidth: number;
  editorContent: string;
  editorDisplayMode: EditorDisplayMode;
  editorAppearanceKey: string;
  editorNodeId: string | null;
  editorNodeViewState?: NodeViewState;
  isDocumentResizing: boolean;
  showAnswerSection: boolean;
  onAnswerChange: (answer: string) => void;
  onEditorChange: (content: string) => void;
  onEditorContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onEditorReady: (adapter: EditorAdapter | null) => void;
  onCloseContextMenu: () => void;
  onCreateHighlight: () => void;
  onCreateCloze: () => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onGoParent: () => void;
  onNodeDesiredRetentionChange: (nodeId: string, desiredRetention: number | null) => void;
  onNodePriorityChange: (nodeId: string, priority: number | null) => void;
  onResetLayout: () => void;
  onSelectNode: (nodeId: string) => void;
  onToggleEditorDisplayMode: () => void;
  onStartDocumentResize: (
    side: ResizeSide,
    event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>
  ) => void;
  nodesById: Record<string, Node>;
  reviewSchedulerSettings: ReviewSchedulerSettings;
}

export function DocumentPanelSection(props: DocumentPanelSectionProps) {
  const activeNode = props.activeNodeId ? props.nodesById[props.activeNodeId] : undefined;
  const reveal = activeNode?.reveal ?? '';
  const hasAnswerSection = Boolean(activeNode?.reveal && activeNode.reveal.trim().length > 0 && props.showAnswerSection);
  const documentLayoutStyle = { '--document-max-width': `${props.documentMaxWidth}px` } as CSSProperties;

  return (
    <section aria-label="Document area" className="flex min-h-0 flex-1 flex-col" style={documentLayoutStyle}>
      <section aria-label="Document panel" className="flex h-full min-h-0 flex-1 flex-col bg-bg-elevated text-foreground">
        <DocumentPanelHeader
          activeNodeId={props.activeNodeId}
          canGoBack={props.canGoBack}
          canGoForward={props.canGoForward}
          canGoParent={props.canGoParent}
          editorDisplayMode={props.editorDisplayMode}
          nodesById={props.nodesById}
          onGoBack={props.onGoBack}
          onGoForward={props.onGoForward}
          onGoParent={props.onGoParent}
          onSelectNode={props.onSelectNode}
          onToggleEditorDisplayMode={props.onToggleEditorDisplayMode}
        />
        <DocumentPanelNodeReviewSettings
          activeNodeId={props.activeNodeId}
          editableNodeId={props.editableNodeId}
          nodesById={props.nodesById}
          onDesiredRetentionChange={props.onNodeDesiredRetentionChange}
          onPriorityChange={props.onNodePriorityChange}
          reviewSchedulerSettings={props.reviewSchedulerSettings}
        />
        <DocumentPanelBody
          editorAppearanceKey={props.editorAppearanceKey}
          editorContent={props.editorContent}
          editorNodeId={props.editorNodeId}
          editorNodeViewState={props.editorNodeViewState}
          hasAnswerSection={hasAnswerSection}
          isDocumentResizing={props.isDocumentResizing}
          onAnswerChange={props.onAnswerChange}
          onEditorChange={props.onEditorChange}
          onEditorContextMenu={props.onEditorContextMenu}
          onEditorReady={props.onEditorReady}
          onResetLayout={props.onResetLayout}
          onStartDocumentResize={props.onStartDocumentResize}
          reveal={reveal}
        />
      </section>
      {props.contextMenu ? (
        <EditorContextMenu
          canRunCommands={props.contextMenu.canRunCommands}
          left={props.contextMenu.left}
          onClose={props.onCloseContextMenu}
          onCreateCloze={props.onCreateCloze}
          onCreateHighlight={props.onCreateHighlight}
          top={props.contextMenu.top}
        />
      ) : null}
    </section>
  );
}
