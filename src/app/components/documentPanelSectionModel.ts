import type { CSSProperties } from 'react';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { isHomeNode, isInboxNode, isVirtualNode, isVirtualRootNode } from '../../features/nodes/model/specialNodes';
import { NODE_TITLE_SLOT_PADDING_TOP, shouldReserveNodeTitleSlot } from '../../shared/lib/nodeTitleSlot';
import type { Translate } from '../../shared/localization/LocalizationProvider';
import { translate, type TranslationKey } from '../../shared/localization/translations';
import { updateNodeImageState } from '../../shared/platform/performanceDiagnosticsProbe';
import { getNodeDocumentStatus, isNodeDocumentLoaded } from '../../store/workspaceRendererBoundary';

import { hasCachedMarkdownImageReference } from './documentPanelImageReferenceCache';
import type { DocumentPanelSectionProps } from './documentPanelSectionTypes';

export { hasVisibleTitleHeading } from '../../shared/lib/nodeTitleSlot';

const READER_END_CUSHION_PADDING = 'clamp(calc(var(--workspace-bottom-toolbar-height) + 1.5rem), 36dvh, 26rem)';
const translateEn: Translate = (key, params) => translate('en', key, params);

interface DocumentEmptyStateKeys {
  descriptionKey: TranslationKey;
  titleKey: TranslationKey;
}

interface DocumentStartupState {
  documentStatus?: ReturnType<typeof getNodeDocumentStatus>;
  emptyState?: DocumentEmptyStateKeys;
  loadingLabel?: string;
}

export type CentralPanelKind = 'document' | 'list';

function resolveDocumentStartupState(props: DocumentPanelSectionProps, activeNode: Node | undefined): DocumentStartupState {
  if (props.isWorkspaceHydrated === false) {
    return {
      loadingLabel: 'Document progress',
      emptyState: {
        titleKey: 'desktop.document.preparingWorkspace.title',
        descriptionKey: 'desktop.document.preparingWorkspace.description'
      }
    };
  }

  if (!props.activeNodeId) {
    if (props.isTrashViewOpen) {
      return {
        emptyState: {
          titleKey: 'desktop.document.emptyFolder.title',
          descriptionKey: 'desktop.document.emptyFolder.description'
        }
      };
    }

    return {
      emptyState: {
        titleKey: 'desktop.document.noneSelected.title',
        descriptionKey: 'desktop.document.noneSelected.description'
      }
    };
  }

  const documentStatus = getNodeDocumentStatus(activeNode);
  if (activeNode && activeNode.kind !== 'folder' && (documentStatus === 'failed' || documentStatus === 'missing')) {
    return {
      documentStatus,
      emptyState: {
        titleKey: 'desktop.document.bodyUnavailable.title',
        descriptionKey: 'desktop.document.bodyUnavailable.description'
      }
    };
  }

  if (activeNode && activeNode.kind !== 'folder' && !isNodeDocumentLoaded(activeNode)) {
    return {
      documentStatus,
      loadingLabel: 'Document progress',
      emptyState: {
        titleKey: 'desktop.document.preparing.title',
        descriptionKey: 'desktop.document.preparing.description'
      }
    };
  }

  return {
    documentStatus
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

  const hasAnswerSection = Boolean(
    !emptyState &&
      showAnswerSection &&
      activeNode?.kind === 'item' &&
      activeNode.reveal !== null
  );
  const shouldUseReaderEndCushion = !emptyState && !hasAnswerSection && editorDisplayMode === 'preview';

  return {
    answerSectionMode: shouldFitItemImages ? 'balanced' : 'fixed',
    documentStatus: startupState.documentStatus,
    editorContentPaddingBottom: shouldUseReaderEndCushion ? READER_END_CUSHION_PADDING : undefined,
    loadingLabel: startupState.loadingLabel,
    emptyState,
    fitBlockImagesToViewport: shouldFitItemImages,
    hasAnswerSection,
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

function getEditorReadingProps(props: DocumentPanelSectionProps) {
  return {
    editorReadingRestoreCommandId: props.editorReadingRestoreCommandId,
    editorReadingRestoreScrollTop: props.editorReadingRestoreScrollTop,
    editorReadingSelection: props.editorReadingSelection,
    editorReadingSelectionMode: props.editorReadingSelectionMode,
    editorReadingTargetViewportMode: props.editorReadingTargetViewportMode,
    editorReadingTargetViewportRatio: props.editorReadingTargetViewportRatio
  };
}

function createPromptImageLoadStateChangeHandler(editorNodeId: string | null) {
  return (state: { loadedCount: number; totalCount: number }) => {
    if (!editorNodeId) return;
    updateNodeImageState(editorNodeId, state.totalCount, state.loadedCount);
  };
}

function getDocumentPanelBodyProps(
  props: DocumentPanelSectionProps,
  panelState: ReturnType<typeof getDocumentPanelState>,
  documentMaxWidth: number,
  t: Translate
) {
  const editorHideTitleHeading = props.activeNodeId ? Boolean(props.nodesById[props.activeNodeId]?.hideTitleHeading) : false;
  const editorNode = props.activeNodeId ? props.nodesById[props.activeNodeId] : undefined;
  return {
    answerSectionMode: panelState.answerSectionMode,
    documentMaxWidth,
    editorAppearanceKey: props.editorAppearanceKey,
    editorContent: props.editorContent,
    editorContentPaddingBottom: panelState.editorContentPaddingBottom,
    editorContentPaddingTop: shouldReserveTitleSlot(editorNode, props.nodesById, props.editorContent, editorHideTitleHeading)
      ? NODE_TITLE_SLOT_PADDING_TOP
      : undefined,
    editorHideTitleHeading,
    immersiveEditing: props.isImmersiveMode && props.isImmersiveEditing,
    reviewCaretLineHighlight: props.reviewCaretLineHighlight,
    reviewEscapeBlurEnabled: props.reviewEscapeBlurEnabled,
    editorNodeId: props.editorNodeId,
    ...getEditorReadingProps(props),
    editorNodeViewState: props.editorNodeViewState,
    onBeginApplyingReadingPosition: props.onBeginApplyingReadingPosition,
    onCompleteApplyingReadingPosition: props.onCompleteApplyingReadingPosition,
    emptyState: panelState.emptyState
      ? {
          title: t(panelState.emptyState.titleKey),
          description: t(panelState.emptyState.descriptionKey)
        }
      : undefined,
    fitBlockImagesToViewport: panelState.fitBlockImagesToViewport,
    hasAnswerSection: panelState.hasAnswerSection,
    onAnswerChange: props.onAnswerChange,
    onEditorChange: props.onEditorChange,
    onEditorContextMenu: props.onEditorContextMenu,
    onEditorInput: props.onEditorInput,
    onEditorRedo: props.onEditorRedo,
    onEditorDoubleClick: props.isImmersiveMode && !props.isImmersiveEditing ? props.onEnterImmersiveEdit : undefined,
    onEditorUndo: props.onEditorUndo,
    onPastedTextAnchors: props.onPastedTextAnchors,
    onEditorReady: props.onEditorReady,
    onShouldSuppressSelectionRestore: props.onShouldSuppressSelectionRestore,
    onSetReadingPositionSelection: props.onSetReadingPositionSelection,
    onPromptImageLoadStateChange: createPromptImageLoadStateChangeHandler(props.editorNodeId),
    onRevealDocumentPosition: props.onRevealDocumentPosition,
    onRevealDocumentSelection: props.onRevealDocumentSelection,
    onResolveDocumentPositionAtViewportY: props.onResolveDocumentPositionAtViewportY,
    readOnly: props.isEditorReadOnly || (props.isImmersiveMode && !props.isImmersiveEditing),
    showDocumentOutline: props.showDocumentOutline,
    reveal: panelState.reveal
  };
}

export function getDocumentPanelView(
  props: DocumentPanelSectionProps,
  editorDisplayMode: 'preview' | 'source',
  documentMaxWidth: number,
  t: Translate = translateEn
) {
  const activeNode = props.activeNodeId ? props.nodesById[props.activeNodeId] : undefined;
  const panelState = getDocumentPanelState(props, activeNode, editorDisplayMode, props.showAnswerSection);
  const isFolderListView = Boolean(
    (props.isFoliolePublishedContext && !activeNode) ||
    (props.isTrashViewOpen && (!activeNode || activeNode.kind === 'folder')) ||
      activeNode &&
        activeNode.kind === 'folder' &&
        !isVirtualNode(activeNode) &&
        (props.editorNodeId === props.activeNodeId || isHomeNode(activeNode) || isInboxNode(activeNode))
  );

  return {
    activeNode,
    bodyProps: getDocumentPanelBodyProps(props, panelState, documentMaxWidth, t),
    documentStatus: panelState.documentStatus,
    documentLayoutStyle: { '--document-max-width': `${documentMaxWidth}px` } as CSSProperties,
    loadingLabel: panelState.loadingLabel ? t('desktop.document.progress') : undefined,
    isFolderListView,
    panelKind: isFolderListView || isVirtualNode(activeNode) || isVirtualRootNode(activeNode)
      ? 'list' as const
      : 'document' as const
  };
}
