import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useLayoutEffect } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import type { Node, NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import {
  markDocumentPanelBound,
  markNodeBodyPainted,
  markNodeBodyReady,
  recordComponentRender
} from '../../shared/platform/performanceDiagnosticsProbe';
import type { NodeViewState } from '../../store/workspaceStore';
import type { ResizeSide } from '../hooks/useDocumentWidthResizer';

import { getDocumentPanelView } from './documentPanelSectionModel';
import { DocumentPanelSectionOverlays } from './DocumentPanelSectionOverlays';
import { DocumentPanelSectionShell } from './DocumentPanelSectionShell';
import { useDocumentPanelImageClozePresentation } from './useDocumentPanelImageClozePresentation';
import { useDocumentPanelSourceUpdateState } from './useDocumentPanelSourceUpdateState';
import type { WorkspaceEditorContextMenu } from './WorkspaceLayout';

export interface DocumentPanelSectionProps {
  activeNodeId: string | null;
  editableNodeId: string | null;
  canGoBack: boolean;
  canGoForward: boolean;
  canGoParent: boolean;
  contextMenu: WorkspaceEditorContextMenu | null;
  documentMaxWidth: number;
  editorContent: string;
  editorAppearanceKey: string;
  isEditorReadOnly: boolean;
  editorNodeId: string | null;
  editorNodeViewState?: NodeViewState;
  isDocumentResizing: boolean;
  showAnswerSection: boolean;
  onAnswerChange: (answer: string) => void;
  onEditorChange: (content: string) => void;
  onNodeContentChange: (nodeId: string, content: string) => void;
  onEditorContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onEditorReady: (adapter: EditorAdapter | null) => void;
  onCloseContextMenu: () => void;
  onCopyImage: () => void;
  onCreateHighlight: () => void;
  onCreatePdfHighlight: (selectionText: string, locator: NodeAnchorLink['locator']) => boolean;
  onCreateCloze: () => void;
  onCutImage: () => void;
  onDeleteImage: () => void;
  onExportImage: () => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onGoParent: () => void;
  onSelectBreadcrumbNode: (nodeId: string) => void;
  onPersistPdfViewState: (nodeId: string, viewState: NodeViewState) => void;
  onRevealDocumentPosition: (position: number) => void;
  onRevealDocumentSelection: (selection: EditorSelection) => void;
  onResolveDocumentPositionAtViewportY: (clientY: number) => number | null;
  onResetLayout: () => void;
  onSelectNode: (nodeId: string) => void;
  onStartDocumentResize: (
    side: ResizeSide,
    event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>
  ) => void;
  nodeOrder: string[];
  trashedNodeIds: string[];
  nodesById: Record<string, Node>;
}

export function DocumentPanelSection(props: DocumentPanelSectionProps) {
  recordComponentRender('documentPanel');
  const { editorDisplayMode } = useAppearanceSettings();
  const activeNode = props.activeNodeId ? props.nodesById[props.activeNodeId] : undefined;
  const { bodyProps, documentLayoutStyle, isFolderListView } = getDocumentPanelView(props, editorDisplayMode);
  const {
    currentSourceUpdateContent,
    handleSourceUpdateDraftChange,
    handleSourceUpdatePanelOpenChange,
    isSourceUpdatePanelOpen,
    sourceUpdatePreview
  } = useDocumentPanelSourceUpdateState(props);

  useLayoutEffect(() => {
    if (!props.editorNodeId || bodyProps.emptyState) {
      return;
    }
    markDocumentPanelBound(props.editorNodeId, `content:${props.editorContent.length}`);
  }, [bodyProps.emptyState, props.editorContent.length, props.editorNodeId]);

  useEffect(() => {
    const editorNodeId = props.editorNodeId;
    if (!editorNodeId || bodyProps.emptyState) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      markNodeBodyPainted(editorNodeId);
      window.requestAnimationFrame(() => {
        markNodeBodyReady(editorNodeId);
      });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [bodyProps.emptyState, bodyProps.reveal, props.editorContent, props.editorNodeId]);

  useDocumentPanelImageClozePresentation({
    activeNode,
    editorNodeId: props.editorNodeId,
    nodesById: props.nodesById,
    trashedNodeIds: props.trashedNodeIds
  });

  return (
    <section aria-label="Document area" className="flex min-h-0 flex-1 flex-col" style={documentLayoutStyle}>
      <DocumentPanelSectionShell
        bodyProps={bodyProps}
        isFolderListView={isFolderListView}
        isSourceUpdatePanelOpen={isSourceUpdatePanelOpen}
        onToggleSourceUpdatePanel={() => handleSourceUpdatePanelOpenChange(!isSourceUpdatePanelOpen)}
        props={props}
        showSourceUpdateAction={Boolean(sourceUpdatePreview.value)}
      />
      <DocumentPanelSectionOverlays
        currentSourceUpdateContent={currentSourceUpdateContent}
        handleSourceUpdateDraftChange={handleSourceUpdateDraftChange}
        handleSourceUpdatePanelOpenChange={handleSourceUpdatePanelOpenChange}
        isSourceUpdatePanelOpen={isSourceUpdatePanelOpen}
        props={props}
        sourceUpdatePreview={sourceUpdatePreview.value}
      />
    </section>
  );
}
