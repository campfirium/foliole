import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { EditorSearchDecorations, EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import { createInlineAnchorKey } from '../../features/editor/adapters/liveMarkdownAnchors';
import type { Node, NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import {
  markDocumentPanelBound,
  markNodeBodyPainted,
  markNodeBodyReady,
  recordComponentRender
} from '../../shared/platform/performanceDiagnosticsProbe';
import { isNodeDocumentLoaded } from '../../store/workspaceRendererBoundary';
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

function collectHiddenTextAnchorKeys(args: {
  activeNodeId: string | null;
  nodesById: Record<string, Node>;
  trashedNodeIds: string[];
}) {
  if (!args.activeNodeId) {
    return [];
  }
  const hiddenKeys = new Set<string>();
  for (const trashedNodeId of args.trashedNodeIds) {
    const node = args.nodesById[trashedNodeId];
    if (
      !node ||
      node.parentNodeId !== args.activeNodeId ||
      !node.anchorLink ||
      node.anchorLink.locator
    ) {
      continue;
    }
    hiddenKeys.add(createInlineAnchorKey(node.anchorLink));
  }
  return [...hiddenKeys];
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
  const hiddenTextAnchorKeys = useMemo(
    () =>
      collectHiddenTextAnchorKeys({
        activeNodeId: props.activeNodeId,
        nodesById: props.nodesById,
        trashedNodeIds: props.trashedNodeIds
      }),
    [props.activeNodeId, props.nodesById, props.trashedNodeIds]
  );
  const {
    currentSourceUpdateContent,
    handleSourceUpdateDraftChange,
    handleSourceUpdatePanelOpenChange,
    isSourceUpdatePanelOpen,
    sourceUpdatePreview
  } = useDocumentPanelSourceUpdateState(props);
  const emptyContent = loadingLabel ? <LoadingDocumentPanelContent loadingLabel={loadingLabel} /> : undefined;

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
    hiddenTextAnchorKeys,
    isFolderListView,
    isSourceUpdatePanelOpen,
    currentSourceUpdateContent,
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

function LoadingDocumentPanelContent({ loadingLabel }: { loadingLabel: string }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center">
      <div
        aria-label={loadingLabel}
        className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-foreground/55"
      />
    </div>
  );
}

export function DocumentPanelSection(props: DocumentPanelSectionProps) {
  recordComponentRender('documentPanel');
  const model = useDocumentPanelSectionModel(props);
  const editorAdapterRef = useRef<EditorAdapter | null>(null);

  function handleEditorReady(adapter: EditorAdapter | null) {
    editorAdapterRef.current = adapter;
    props.onEditorReady(adapter);
  }

  function handlePreviewDocumentSelection(selection: EditorSelection) {
    editorAdapterRef.current?.restoreSelection(selection);
  }

  function handlePreviewTopicSearchDecorations(searchDecorations: EditorSearchDecorations | null) {
    editorAdapterRef.current?.setSearchDecorations(searchDecorations);
  }

  return (
    <section aria-label="Document area" className="flex min-h-0 flex-1 flex-col" style={model.documentLayoutStyle}>
      <DocumentPanelSectionShell
        bodyProps={{
          ...model.bodyProps,
          onEditorReady: handleEditorReady,
          hiddenTextAnchorKeys: model.hiddenTextAnchorKeys,
          emptyContent: model.emptyContent
        }}
        isFolderListView={model.isFolderListView}
        isSourceUpdatePanelOpen={model.isSourceUpdatePanelOpen}
        onToggleSourceUpdatePanel={() =>
          model.handleSourceUpdatePanelOpenChange(!model.isSourceUpdatePanelOpen)
        }
        onPreviewTopicSearchDecorations={handlePreviewTopicSearchDecorations}
        props={{
          ...props,
          onEditorReady: handleEditorReady
        }}
        onPreviewDocumentSelection={handlePreviewDocumentSelection}
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
