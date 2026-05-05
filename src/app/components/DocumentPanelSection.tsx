import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { isInboxNode } from '../../features/nodes/model/specialNodes';
import { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import type { NodeViewState } from '../../store/workspaceStore';
import type { ResizeSide } from '../hooks/useDocumentWidthResizer';

import { DocumentPanelBody } from './DocumentPanelBody';
import { DocumentPanelHeader } from './DocumentPanelHeader';
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
  onRevealDocumentPosition: (position: number) => void;
  onRevealDocumentSelection: (selection: EditorSelection) => void;
  onResolveDocumentPositionAtViewportY: (clientY: number) => number | null;
  onResetLayout: () => void;
  onSelectNode: (nodeId: string) => void;
  onStartDocumentResize: (
    side: ResizeSide,
    event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>
  ) => void;
  nodesById: Record<string, Node>;
}

function resolveInboxEmptyState(activeNode: Node | undefined) {
  return isInboxNode(activeNode)
    ? {
        title: 'Inbox is ready',
        description:
          'Formal imports will land under Inbox. When items arrive, select a child node to read or edit it.'
      }
    : undefined;
}

function getDocumentPanelState(props: DocumentPanelSectionProps, editorDisplayMode: 'preview' | 'source') {
  const activeNode = props.activeNodeId ? props.nodesById[props.activeNodeId] : undefined;
  const emptyState = resolveInboxEmptyState(activeNode);
  const reveal = activeNode?.reveal ?? '';

  return {
    editorContentPaddingBottom: editorDisplayMode === 'preview' ? 'min(68dvh, 36rem)' : undefined,
    emptyState,
    hasAnswerSection: Boolean(!emptyState && activeNode?.reveal && activeNode.reveal.trim().length > 0 && props.showAnswerSection),
    reveal
  };
}

export function DocumentPanelSection(props: DocumentPanelSectionProps) {
  const { editorDisplayMode } = useAppearanceSettings();
  const { editorContentPaddingBottom, emptyState, hasAnswerSection, reveal } = getDocumentPanelState(props, editorDisplayMode);
  const documentLayoutStyle = { '--document-max-width': `${props.documentMaxWidth}px` } as CSSProperties;

  return (
    <section aria-label="Document area" className="flex min-h-0 flex-1 flex-col" style={documentLayoutStyle}>
      <section aria-label="Document panel" className="flex h-full min-h-0 flex-1 flex-col bg-bg-elevated text-foreground">
        <DocumentPanelHeader
          activeNodeId={props.activeNodeId}
          canGoBack={props.canGoBack}
          canGoForward={props.canGoForward}
          canGoParent={props.canGoParent}
          nodesById={props.nodesById}
          onGoBack={props.onGoBack}
          onGoForward={props.onGoForward}
          onGoParent={props.onGoParent}
          onSelectNode={props.onSelectNode}
        />
        <DocumentPanelBody
          documentMaxWidth={props.documentMaxWidth}
          editorAppearanceKey={props.editorAppearanceKey}
          editorContent={props.editorContent}
          editorContentPaddingBottom={editorContentPaddingBottom}
          editorNodeId={props.editorNodeId}
          editorNodeViewState={props.editorNodeViewState}
          emptyState={emptyState}
          hasAnswerSection={hasAnswerSection}
          isDocumentResizing={props.isDocumentResizing}
          onAnswerChange={props.onAnswerChange}
          onEditorChange={props.onEditorChange}
          onEditorContextMenu={props.onEditorContextMenu}
          onEditorReady={props.onEditorReady}
          onRevealDocumentPosition={props.onRevealDocumentPosition}
          onRevealDocumentSelection={props.onRevealDocumentSelection}
          onResolveDocumentPositionAtViewportY={props.onResolveDocumentPositionAtViewportY}
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
