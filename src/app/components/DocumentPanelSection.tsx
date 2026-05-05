import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useLayoutEffect, useMemo } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';
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

export function DocumentPanelSection(props: DocumentPanelSectionProps) {
  recordComponentRender('documentPanel');
  const { editorDisplayMode } = useAppearanceSettings();
  const activeNode = props.activeNodeId ? props.nodesById[props.activeNodeId] : undefined;
  const { bodyProps, documentLayoutStyle, isFolderListView, loadingLabel } = getDocumentPanelView(props, editorDisplayMode);
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

  useLayoutEffect(() => {
    if (!props.editorNodeId || bodyProps.emptyState) {
      return;
    }
    markDocumentPanelBound(props.editorNodeId, `content:${props.editorContent.length}`);
  }, [bodyProps.emptyState, props.editorContent.length, props.editorNodeId]);

  useEffect(() => {
    const editorNodeId = props.editorNodeId;
    if (!editorNodeId || bodyProps.emptyState || !isEditorDocumentLoaded) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      markNodeBodyPainted(editorNodeId);
      window.requestAnimationFrame(() => {
        markNodeBodyReady(editorNodeId);
      });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [bodyProps.emptyState, bodyProps.reveal, isEditorDocumentLoaded, props.editorContent, props.editorNodeId]);

  useDocumentPanelImageClozePresentation({
    activeNode,
    editorNodeId: props.editorNodeId,
    nodesById: props.nodesById,
    trashedNodeIds: props.trashedNodeIds
  });

  return (
    <section aria-label="Document area" className="flex min-h-0 flex-1 flex-col" style={documentLayoutStyle}>
      <DocumentPanelSectionShell
        bodyProps={{
          ...bodyProps,
          hiddenTextAnchorKeys,
          emptyContent: loadingLabel ? (
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <div
                aria-label={loadingLabel}
                className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-foreground/55"
              />
            </div>
          ) : undefined
        }}
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
