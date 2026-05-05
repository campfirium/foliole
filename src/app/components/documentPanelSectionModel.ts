import type { CSSProperties } from 'react';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { isInboxNode, isVirtualNode } from '../../features/nodes/model/specialNodes';
import { NODE_TITLE_SLOT_PADDING_TOP, shouldReserveNodeTitleSlot } from '../../shared/lib/nodeTitleSlot';
import { updateNodeImageState } from '../../shared/platform/performanceDiagnosticsProbe';
import { isNodeDocumentLoaded } from '../../store/workspaceRendererBoundary';

import { hasCachedMarkdownImageReference } from './documentPanelImageReferenceCache';
import type { DocumentPanelSectionProps } from './documentPanelSectionTypes';

export { hasVisibleTitleHeading } from '../../shared/lib/nodeTitleSlot';

function resolveDocumentStartupState(props: DocumentPanelSectionProps, activeNode: Node | undefined) {
  if (props.isWorkspaceHydrated === false) {
    return {
      loadingLabel: 'Loading document',
      emptyState: {
        title: 'Loading workspace',
        description: 'Your notes are still being prepared.'
      }
    };
  }

  if (!props.activeNodeId) {
    if (props.isTrashViewOpen) {
      return {
        emptyState: {
          title: 'This folder is empty',
          description: 'Topics and folders will appear here after you add them to this folder.'
        }
      };
    }

    return {
      emptyState: {
        title: 'No document selected',
        description: 'Choose a document from the list to keep working.'
      }
    };
  }

  if (activeNode && activeNode.kind !== 'folder' && !isNodeDocumentLoaded(activeNode)) {
    return {
      loadingLabel: 'Loading document',
      emptyState: {
        title: 'Loading document',
        description: 'The selected document is still loading.'
      }
    };
  }

  return {
    loadingLabel: undefined,
    emptyState: undefined
  };
}

function getDocumentPanelState(
  props: DocumentPanelSectionProps,
  activeNode: Node | undefined,
  editorDisplayMode: 'preview' | 'source',
  showAnswerSection: boolean
) {
  const startupState = resolveDocumentStartupState(props, activeNode);
  const emptyState = startupState.emptyState;
  const reveal = activeNode?.reveal ?? '';
  const shouldCheckItemImages = activeNode?.kind === 'item' && Boolean(showAnswerSection);
  const hasPromptImage = shouldCheckItemImages
    ? Boolean(activeNode?.content && hasCachedMarkdownImageReference(activeNode.content))
    : false;
  const hasAnswerImage = shouldCheckItemImages
    ? Boolean(activeNode?.reveal && hasCachedMarkdownImageReference(activeNode.reveal))
    : false;
  const shouldFitItemImages = shouldCheckItemImages && (hasPromptImage || hasAnswerImage);

  return {
    answerSectionMode: shouldFitItemImages ? 'balanced' : 'fixed',
    editorContentPaddingBottom: undefined,
    loadingLabel: startupState.loadingLabel,
    emptyState,
    fitBlockImagesToViewport: shouldFitItemImages,
    hasAnswerSection: Boolean(!emptyState && activeNode?.reveal && activeNode.reveal.trim().length > 0 && showAnswerSection),
    reveal
  } as const;
}

export function shouldReserveTitleSlot(
  node: Node | undefined,
  nodesById: Record<string, Node>,
  content: string,
  hideTitleHeading: boolean
) {
  return shouldReserveNodeTitleSlot({ content, hideTitleHeading, node, nodesById });
}

function getDocumentPanelBodyProps(
  props: DocumentPanelSectionProps,
  panelState: ReturnType<typeof getDocumentPanelState>
) {
  const editorHideTitleHeading = props.activeNodeId ? Boolean(props.nodesById[props.activeNodeId]?.hideTitleHeading) : false;
  const editorNode = props.activeNodeId ? props.nodesById[props.activeNodeId] : undefined;
  return {
    answerSectionMode: panelState.answerSectionMode,
    documentMaxWidth: props.documentMaxWidth,
    editorAppearanceKey: props.editorAppearanceKey,
    editorContent: props.editorContent,
    editorContentPaddingBottom: panelState.editorContentPaddingBottom,
    editorContentPaddingTop: shouldReserveTitleSlot(editorNode, props.nodesById, props.editorContent, editorHideTitleHeading)
      ? NODE_TITLE_SLOT_PADDING_TOP
      : undefined,
    editorHideTitleHeading,
    immersiveEditing: props.isImmersiveMode && props.isImmersiveEditing,
    editorNodeId: props.editorNodeId,
    editorReadingSelection: props.editorReadingSelection,
    editorReadingTargetViewportMode: props.editorReadingTargetViewportMode,
    editorReadingTargetViewportRatio: props.editorReadingTargetViewportRatio,
    editorNodeViewState: props.editorNodeViewState,
    onBeginApplyingReadingPosition: props.onBeginApplyingReadingPosition,
    onCompleteApplyingReadingPosition: props.onCompleteApplyingReadingPosition,
    emptyState: panelState.emptyState,
    fitBlockImagesToViewport: panelState.fitBlockImagesToViewport,
    hasAnswerSection: panelState.hasAnswerSection,
    isDocumentResizing: props.isDocumentResizing,
    onAnswerChange: props.onAnswerChange,
    onEditorChange: props.onEditorChange,
    onEditorContextMenu: props.onEditorContextMenu,
    onEditorDoubleClick: props.isImmersiveMode && !props.isImmersiveEditing ? props.onEnterImmersiveEdit : undefined,
    onPastedTextAnchors: props.onPastedTextAnchors,
    onEditorReady: props.onEditorReady,
    onShouldSuppressSelectionRestore: props.onShouldSuppressSelectionRestore,
    onSetReadingPositionSelection: props.onSetReadingPositionSelection,
    onPromptImageLoadStateChange: (state: { loadedCount: number; totalCount: number }) => {
      if (!props.editorNodeId) {
        return;
      }
      updateNodeImageState(props.editorNodeId, state.totalCount, state.loadedCount);
    },
    onRevealDocumentPosition: props.onRevealDocumentPosition,
    onRevealDocumentSelection: props.onRevealDocumentSelection,
    onResolveDocumentPositionAtViewportY: props.onResolveDocumentPositionAtViewportY,
    onResetLayout: props.onResetLayout,
    onStartDocumentResize: props.onStartDocumentResize,
    readOnly: props.isEditorReadOnly || (props.isImmersiveMode && !props.isImmersiveEditing),
    showDocumentOutline: props.showDocumentOutline,
    showDocumentResizeHandles: !props.isImmersiveMode,
    reveal: panelState.reveal
  };
}

export function getDocumentPanelView(
  props: DocumentPanelSectionProps,
  editorDisplayMode: 'preview' | 'source'
) {
  const activeNode = props.activeNodeId ? props.nodesById[props.activeNodeId] : undefined;
  const panelState = getDocumentPanelState(props, activeNode, editorDisplayMode, props.showAnswerSection);

  return {
    activeNode,
    bodyProps: getDocumentPanelBodyProps(props, panelState),
    documentLayoutStyle: { '--document-max-width': `${props.documentMaxWidth}px` } as CSSProperties,
    loadingLabel: panelState.loadingLabel,
    isFolderListView: Boolean(
      activeNode &&
        activeNode.kind === 'folder' &&
        !isVirtualNode(activeNode) &&
        (props.editorNodeId === props.activeNodeId || isInboxNode(activeNode))
    )
  };
}
