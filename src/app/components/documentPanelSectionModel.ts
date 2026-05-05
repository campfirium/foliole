import type { CSSProperties } from 'react';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { isInboxNode, isVirtualNode } from '../../features/nodes/model/specialNodes';
import { updateNodeImageState } from '../../shared/platform/performanceDiagnosticsProbe';

import { hasCachedMarkdownImageReference } from './documentPanelImageReferenceCache';
import type { DocumentPanelSectionProps } from './DocumentPanelSection';

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
    editorContentPaddingBottom: shouldPadDocumentTail ? 'min(68dvh, 36rem)' : undefined,
    emptyState,
    fitBlockImagesToViewport: shouldFitItemImages,
    hasAnswerSection: Boolean(!emptyState && activeNode?.reveal && activeNode.reveal.trim().length > 0 && showAnswerSection),
    reveal
  } as const;
}

function getDocumentPanelBodyProps(
  props: DocumentPanelSectionProps,
  panelState: ReturnType<typeof getDocumentPanelState>
) {
  return {
    answerSectionMode: panelState.answerSectionMode,
    documentMaxWidth: props.documentMaxWidth,
    editorAppearanceKey: props.editorAppearanceKey,
    editorContent: props.editorContent,
    editorContentPaddingBottom: panelState.editorContentPaddingBottom,
    editorHideTitleHeading: props.activeNodeId ? Boolean(props.nodesById[props.activeNodeId]?.hideTitleHeading) : false,
    editorNodeId: props.editorNodeId,
    editorNodeViewState: props.editorNodeViewState,
    emptyState: panelState.emptyState,
    fitBlockImagesToViewport: panelState.fitBlockImagesToViewport,
    hasAnswerSection: panelState.hasAnswerSection,
    isDocumentResizing: props.isDocumentResizing,
    onAnswerChange: props.onAnswerChange,
    onEditorChange: props.onEditorChange,
    onEditorContextMenu: props.onEditorContextMenu,
    onEditorReady: props.onEditorReady,
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
    readOnly: props.isEditorReadOnly,
    reveal: panelState.reveal
  };
}

export function getDocumentPanelView(
  props: DocumentPanelSectionProps,
  editorDisplayMode: 'preview' | 'source'
) {
  const activeNode = props.activeNodeId ? props.nodesById[props.activeNodeId] : undefined;
  const panelState = getDocumentPanelState(activeNode, editorDisplayMode, props.showAnswerSection);

  return {
    activeNode,
    bodyProps: getDocumentPanelBodyProps(props, panelState),
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
