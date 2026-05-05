import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useLayoutEffect, useMemo } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import type { ClipboardAnchorRange } from '../../features/editor/model/anchorClipboardPayload';
import { collectDocumentTextAnchorPresentation } from '../../features/editor/model/documentTextAnchorDecorations';
import type { Node, NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import type { ReviewSchedulerSettings } from '../../features/settings/model/reviewSchedulerSettings';
import {
  markDocumentPanelBound,
  markNodeBodyPainted,
  markNodeBodyReady,
  recordComponentRender
} from '../../shared/platform/performanceDiagnosticsProbe';
import { isNodeDocumentLoaded } from '../../store/workspaceRendererBoundary';
import type { NodeViewState } from '../../store/workspaceStore';
import type { ResizeSide } from '../hooks/useDocumentWidthResizer';

import { DocumentPanelLoadingContent } from './DocumentPanelLoadingContent';
import { getDocumentPanelView } from './documentPanelSectionModel';
import { DocumentPanelSectionOverlays } from './DocumentPanelSectionOverlays';
import { DocumentPanelSectionShell } from './DocumentPanelSectionShell';
import {
  buildResolvedDocumentPanelProps,
  buildTopicBacklinks,
  useDocumentPanelInteractions
} from './documentPanelSectionSupport';
import { useDocumentPanelImageClozePresentation } from './useDocumentPanelImageClozePresentation';
import { useDocumentPanelSourceUpdateState } from './useDocumentPanelSourceUpdateState';
import { useNodeBacklinks } from './useNodeBacklinks';
import type { WorkspaceEditorContextMenu } from './WorkspaceLayout';

export interface DocumentPanelSectionProps {
  activeNodeId: string | null;
  isWorkspaceHydrated?: boolean;
  editableNodeId: string | null;
  canGoBack: boolean;
  canGoForward: boolean;
  canGoParent: boolean;
  contextMenu: WorkspaceEditorContextMenu | null;
  documentMaxWidth: number;
  editorContent: string;
  editorAppearanceKey: string;
  isEditorReadOnly: boolean;
  isImmersiveEditing?: boolean;
  isImmersiveMode?: boolean;
  onEnterImmersiveEdit?: () => void;
  isPriorityQuickSetActive?: boolean;
  editorNodeId: string | null;
  editorReadingSelection?: EditorSelection | null;
  editorNodeViewState?: NodeViewState;
  onBeginApplyingReadingPosition?: (selection: EditorSelection, reason: string) => void;
  onCompleteApplyingReadingPosition?: (reason: string) => void;
  isDocumentResizing: boolean;
  showAnswerSection: boolean;
  onAnswerChange: (answer: string) => void;
  onEditorChange: (content: string) => void;
  onNodeContentChange: (nodeId: string, content: string) => void;
  onNodePriorityChange?: (nodeId: string, priority: number | null) => void;
  onEditorContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onEditorReady: (adapter: EditorAdapter | null) => void;
  onShouldSuppressSelectionRestore?: () => boolean;
  onSetReadingPositionSelection?: (selection: EditorSelection) => void;
  onCloseContextMenu: () => void;
  onCopyImage: () => void;
  onCreateHighlight: () => void;
  onPastedTextAnchors?: (payload: { anchors: ClipboardAnchorRange[]; content: string; nodeId: string }) => void;
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
  priorityQuickSetShortcutLabel?: string;
  reviewSchedulerSettings?: ReviewSchedulerSettings;
  nodeOrder: string[];
  trashedNodeIds: string[];
  nodesById: Record<string, Node>;
}

function useDocumentPanelTextAnchorState(props: DocumentPanelSectionProps) {
  return useMemo(
    () =>
      collectDocumentTextAnchorPresentation({
        activeNodeId: props.activeNodeId,
        nodesById: props.nodesById,
        parentContent: props.editorContent,
        trashedNodeIds: props.trashedNodeIds
      }),
    [props.activeNodeId, props.editorContent, props.nodesById, props.trashedNodeIds]
  );
}

function useDocumentPanelSectionModel(props: DocumentPanelSectionProps) {
  const { editorDisplayMode } = useAppearanceSettings();
  const activeNode = props.activeNodeId ? props.nodesById[props.activeNodeId] : undefined;
  const { bodyProps, documentLayoutStyle, isFolderListView, loadingLabel } = getDocumentPanelView(
    props,
    editorDisplayMode
  );
  const editorNode = props.editorNodeId ? props.nodesById[props.editorNodeId] : undefined;
  const isEditorDocumentLoaded = !props.editorNodeId || isNodeDocumentLoaded(editorNode);
  const textAnchorPresentation = useDocumentPanelTextAnchorState(props);
  const {
    currentSourceUpdateContent,
    handleSourceUpdateDraftChange,
    handleSourceUpdatePanelOpenChange,
    isSourceUpdatePanelOpen,
    sourceUpdatePreview
  } = useDocumentPanelSourceUpdateState(props);
  const backlinks = useNodeBacklinks({
    targetNodeId: props.activeNodeId,
    nodeOrder: props.nodeOrder,
    nodesById: props.nodesById,
    trashedNodeIds: props.trashedNodeIds
  });
  const emptyContent = loadingLabel ? <DocumentPanelLoadingContent loadingLabel={loadingLabel} /> : undefined;
  useDocumentPanelPerformanceMarkers(props, Boolean(bodyProps.emptyState), isEditorDocumentLoaded);

  useDocumentPanelImageClozePresentation({
    activeNode,
    editorNodeId: props.editorNodeId,
    nodesById: props.nodesById,
    trashedNodeIds: props.trashedNodeIds
  });

  return {
    bodyProps,
    documentLayoutStyle,
    emptyContent,
    textAnchorPresentation,
    isFolderListView,
    isSourceUpdatePanelOpen,
    currentSourceUpdateContent,
    backlinks,
    handleSourceUpdateDraftChange,
    handleSourceUpdatePanelOpenChange,
    sourceUpdatePreview: sourceUpdatePreview.value
  };
}

function useDocumentPanelPerformanceMarkers(
  props: DocumentPanelSectionProps,
  isEmptyState: boolean,
  isEditorDocumentLoaded: boolean
) {
  useLayoutEffect(() => {
    if (!props.editorNodeId || isEmptyState) {
      return;
    }
    markDocumentPanelBound(props.editorNodeId, `content:${props.editorContent.length}`);
  }, [isEmptyState, props.editorContent.length, props.editorNodeId]);

  useEffect(() => {
    const editorNodeId = props.editorNodeId;
    if (!editorNodeId || isEmptyState || !isEditorDocumentLoaded) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      markNodeBodyPainted(editorNodeId);
      window.requestAnimationFrame(() => {
        markNodeBodyReady(editorNodeId);
      });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [isEditorDocumentLoaded, isEmptyState, props.editorContent, props.editorNodeId]);
}

export function DocumentPanelSection(props: DocumentPanelSectionProps) {
  recordComponentRender('documentPanel');
  const model = useDocumentPanelSectionModel(props);
  const interactions = useDocumentPanelInteractions(props);
  const resolvedProps = buildResolvedDocumentPanelProps(props);
  const topicBacklinks = buildTopicBacklinks({
    activeNodeId: props.activeNodeId,
    backlinks: model.backlinks,
    nodesById: props.nodesById
  });
  return (
    <section aria-label="Document area" className="flex min-h-0 flex-1 flex-col" style={model.documentLayoutStyle}>
      <DocumentPanelSectionShell
        bodyProps={{
          ...model.bodyProps,
          onEditorReady: interactions.handleEditorReady,
          textAnchorPresentation: model.textAnchorPresentation,
          emptyContent: model.emptyContent,
          onOpenNodeLink: interactions.handleOpenNodeLink
        }}
        backlinks={topicBacklinks}
        isFolderListView={model.isFolderListView}
        isSourceUpdatePanelOpen={model.isSourceUpdatePanelOpen}
        onToggleSourceUpdatePanel={() =>
          model.handleSourceUpdatePanelOpenChange(!model.isSourceUpdatePanelOpen)
        }
        onPreviewTopicSearchDecorations={interactions.handlePreviewTopicSearchDecorations}
        props={{
          ...resolvedProps,
          onEditorReady: interactions.handleEditorReady
        }}
        onPreviewDocumentSelection={interactions.handlePreviewDocumentSelection}
        showSourceUpdateAction={Boolean(model.sourceUpdatePreview)}
      />
      <DocumentPanelSectionOverlays
        currentSourceUpdateContent={model.currentSourceUpdateContent}
        handleSourceUpdateDraftChange={model.handleSourceUpdateDraftChange}
        handleSourceUpdatePanelOpenChange={model.handleSourceUpdatePanelOpenChange}
        isSourceUpdatePanelOpen={model.isSourceUpdatePanelOpen}
        props={props}
        sourceUpdatePreview={model.sourceUpdatePreview}
      />
    </section>
  );
}
