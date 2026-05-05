import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import {
  deriveImageClozeRegionsFromChildren,
  getImageClozeLocator,
  isImageClozeNode,
  listImageClozePresentationRegions
} from '../../features/image-cloze/model/imageCloze';
import {
  getImageClozeAnswerEditorNodeId,
  registerImageClozeEditorPresentation,
  unregisterImageClozeEditorPresentation
} from '../../features/image-cloze/model/imageClozePresentation';
import type { Node, NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { isInboxNode, isVirtualNode } from '../../features/nodes/model/specialNodes';
import { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import type { NodeViewState } from '../../store/workspaceStore';
import type { ResizeSide } from '../hooks/useDocumentWidthResizer';

import { DocumentPanelSectionOverlays } from './DocumentPanelSectionOverlays';
import { DocumentPanelSectionShell } from './DocumentPanelSectionShell';
import { useNodeSourceUpdatePreview } from './useNodeSourceUpdatePreview';
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
function resolveInboxEmptyState(activeNode: Node | undefined) {
  return isInboxNode(activeNode)
    ? {
        title: 'Inbox is ready',
        description:
          'Formal imports will land under Inbox. When items arrive, select a child node to read or edit it.'
      }
    : undefined;
}

function getDocumentPanelState(
  activeNode: Node | undefined,
  editorDisplayMode: 'preview' | 'source',
  showAnswerSection: boolean
) {
  const emptyState = resolveInboxEmptyState(activeNode);
  const reveal = activeNode?.reveal ?? '';
  const shouldPadDocumentTail = editorDisplayMode === 'preview' && activeNode?.kind !== 'item';
  const shouldConstrainItemImages = activeNode?.kind === 'item' && Boolean(showAnswerSection);

  return {
    editorContentPaddingBottom: shouldPadDocumentTail ? 'min(68dvh, 36rem)' : undefined,
    editorImageMaxWidth: shouldConstrainItemImages ? '50%' : undefined,
    emptyState,
    hasAnswerSection: Boolean(!emptyState && activeNode?.reveal && activeNode.reveal.trim().length > 0 && showAnswerSection),
    reveal
  };
}

function getDocumentPanelBodyProps(
  props: DocumentPanelSectionProps,
  editorContentPaddingBottom: string | undefined,
  editorImageMaxWidth: string | undefined,
  emptyState: ReturnType<typeof resolveInboxEmptyState>,
  hasAnswerSection: boolean,
  reveal: string,
  imageClozePresentationRefreshToken: number
) {
  return {
    documentMaxWidth: props.documentMaxWidth,
    editorAppearanceKey: `${props.editorAppearanceKey}:image-cloze:${imageClozePresentationRefreshToken}`,
    editorContent: props.editorContent,
    editorContentPaddingBottom,
    editorImageMaxWidth,
    editorHideTitleHeading: props.activeNodeId ? Boolean(props.nodesById[props.activeNodeId]?.hideTitleHeading) : false,
    editorNodeId: props.editorNodeId,
    editorNodeViewState: props.editorNodeViewState,
    emptyState,
    hasAnswerSection,
    isDocumentResizing: props.isDocumentResizing,
    onAnswerChange: props.onAnswerChange,
    onEditorChange: props.onEditorChange,
    onEditorContextMenu: props.onEditorContextMenu,
    onEditorReady: props.onEditorReady,
    onRevealDocumentPosition: props.onRevealDocumentPosition,
    onRevealDocumentSelection: props.onRevealDocumentSelection,
    onResolveDocumentPositionAtViewportY: props.onResolveDocumentPositionAtViewportY,
    onResetLayout: props.onResetLayout,
    onStartDocumentResize: props.onStartDocumentResize,
    readOnly: props.isEditorReadOnly,
    reveal
  };
}

function getDocumentPanelView(
  props: DocumentPanelSectionProps,
  editorDisplayMode: 'preview' | 'source',
  imageClozePresentationRefreshToken: number
) {
  const activeNode = props.activeNodeId ? props.nodesById[props.activeNodeId] : undefined;
  const { editorContentPaddingBottom, editorImageMaxWidth, emptyState, hasAnswerSection, reveal } = getDocumentPanelState(
    activeNode,
    editorDisplayMode,
    props.showAnswerSection
  );

  return {
    bodyProps: getDocumentPanelBodyProps(
      props,
      editorContentPaddingBottom,
      editorImageMaxWidth,
      emptyState,
      hasAnswerSection,
      reveal,
      imageClozePresentationRefreshToken
    ),
    documentLayoutStyle: { '--document-max-width': `${props.documentMaxWidth}px` } as CSSProperties,
    isFolderListView: Boolean(
      activeNode &&
        activeNode.kind === 'folder' &&
        !isInboxNode(activeNode) &&
        !isVirtualNode(activeNode) &&
        props.editorNodeId === props.activeNodeId
    )
  };
}

function useSourceUpdatePanelState(props: DocumentPanelSectionProps) {
  const [isSourceUpdatePanelOpen, setIsSourceUpdatePanelOpen] = useState(false);
  const [sourceUpdateDraftContent, setSourceUpdateDraftContent] = useState<string | null>(null);
  const sourceUpdateDraftRef = useRef<string | null>(null);
  const sourceUpdatePreview = useNodeSourceUpdatePreview(props.activeNodeId);

  const flushSourceUpdateDraft = useCallback(() => {
    const draft = sourceUpdateDraftRef.current;
    if (draft === null || draft === props.editorContent) {
      return;
    }
    if (!props.editorNodeId) {
      props.onEditorChange(draft);
      return;
    }
    props.onNodeContentChange(props.editorNodeId, draft);
  }, [props.editorContent, props.editorNodeId, props.onEditorChange, props.onNodeContentChange]);

  const handleSourceUpdatePanelOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        const nextDraft = sourceUpdateDraftRef.current ?? props.editorContent;
        sourceUpdateDraftRef.current = nextDraft;
        setSourceUpdateDraftContent(nextDraft);
        setIsSourceUpdatePanelOpen(true);
        return;
      }

      flushSourceUpdateDraft();
      sourceUpdateDraftRef.current = null;
      setSourceUpdateDraftContent(null);
      setIsSourceUpdatePanelOpen(false);
    },
    [flushSourceUpdateDraft, props.editorContent]
  );

  useEffect(() => {
    if (isSourceUpdatePanelOpen && !sourceUpdatePreview.value && !sourceUpdatePreview.isLoading) {
      handleSourceUpdatePanelOpenChange(false);
    }
  }, [handleSourceUpdatePanelOpenChange, isSourceUpdatePanelOpen, sourceUpdatePreview.isLoading, sourceUpdatePreview.value]);

  useEffect(() => {
    if (!isSourceUpdatePanelOpen) {
      sourceUpdateDraftRef.current = null;
      setSourceUpdateDraftContent((current) => (current === null ? current : null));
      return;
    }
    sourceUpdateDraftRef.current = props.editorContent;
    setSourceUpdateDraftContent((current) => (current === props.editorContent ? current : props.editorContent));
  }, [isSourceUpdatePanelOpen, props.editorContent, props.editorNodeId]);

  return {
    currentSourceUpdateContent: sourceUpdateDraftContent ?? props.editorContent,
    handleSourceUpdateDraftChange: (content: string) => {
      sourceUpdateDraftRef.current = content;
      setSourceUpdateDraftContent(content);
    },
    handleSourceUpdatePanelOpenChange,
    isSourceUpdatePanelOpen,
    sourceUpdatePreview
  };
}

export function DocumentPanelSection(props: DocumentPanelSectionProps) {
  const { editorDisplayMode } = useAppearanceSettings();
  const activeNode = props.activeNodeId ? props.nodesById[props.activeNodeId] : undefined;
  const [imageClozePresentationRefreshToken, setImageClozePresentationRefreshToken] = useState(0);
  const { bodyProps, documentLayoutStyle, isFolderListView } = getDocumentPanelView(
    props,
    editorDisplayMode,
    imageClozePresentationRefreshToken
  );
  const {
    currentSourceUpdateContent,
    handleSourceUpdateDraftChange,
    handleSourceUpdatePanelOpenChange,
    isSourceUpdatePanelOpen,
    sourceUpdatePreview
  } = useSourceUpdatePanelState(props);

  useLayoutEffect(() => {
    if (!props.editorNodeId || !activeNode) {
      return;
    }
    const promptNodeId = props.editorNodeId;
    const answerNodeId = getImageClozeAnswerEditorNodeId(props.editorNodeId);
    const parentRegions = listImageClozePresentationRegions(
      activeNode.imageRegions ??
        deriveImageClozeRegionsFromChildren({
          nodeId: activeNode.id,
          nodesById: props.nodesById,
          trashedNodeIds: props.trashedNodeIds
        })
    );

    if (!isImageClozeNode(activeNode)) {
      if (parentRegions.length === 0) {
        return;
      }
      registerImageClozeEditorPresentation(promptNodeId, {
        canCreate: true,
        focusRegionId: null,
        hiddenRegionIds: [],
        outlinedRegionIds: parentRegions.map((region) => region.id),
        regions: parentRegions
      });
      setImageClozePresentationRefreshToken((value) => value + 1);
      return () => {
        unregisterImageClozeEditorPresentation(promptNodeId);
      };
    }

    const locator = getImageClozeLocator(activeNode.anchorLink);
    if (!locator) {
      return;
    }
    const currentRegionId = activeNode.anchorLink?.id ?? 'current';
    registerImageClozeEditorPresentation(promptNodeId, {
      canCreate: false,
      focusRegionId: null,
      hiddenRegionIds: [currentRegionId],
      outlinedRegionIds: [],
      regions: [{ ...locator, id: currentRegionId }]
    });
    if (answerNodeId) {
      registerImageClozeEditorPresentation(answerNodeId, {
        canCreate: false,
        focusRegionId: currentRegionId,
        hiddenRegionIds: [],
        outlinedRegionIds: [currentRegionId],
        regions: [{ ...locator, id: currentRegionId }]
      });
    }
    setImageClozePresentationRefreshToken((value) => value + 1);
    return () => {
      unregisterImageClozeEditorPresentation(promptNodeId);
      if (answerNodeId) {
        unregisterImageClozeEditorPresentation(answerNodeId);
      }
    };
  }, [activeNode, props.editorNodeId, props.nodesById, props.trashedNodeIds]);

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
