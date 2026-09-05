import { useMemo, useRef } from 'react';

import { collectDocumentTextAnchorDecorations } from '../../features/editor/model/documentTextAnchorDecorations';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import { definedProps } from '../../shared/lib/definedProps';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  recordComponentRender
} from '../../shared/platform/performanceDiagnosticsProbe';
import { isNodeDocumentLoaded } from '../../store/workspaceRendererBoundary';

import { useDocumentPanelSectionDiagnostic } from './documentPanelSectionDiagnostic';
import { getDocumentPanelView } from './documentPanelSectionModel';
import { DocumentPanelSectionOverlayHost } from './DocumentPanelSectionOverlayHost';
import { DocumentPanelSectionShell } from './DocumentPanelSectionShell';
import {
  buildResolvedDocumentPanelProps,
  buildTopicBacklinks,
  renderDocumentPanelEmptyContent,
  useDocumentPanelInteractions
} from './documentPanelSectionSupport';
import type { DocumentPanelSectionProps } from './documentPanelSectionTypes';
import { resolveImmersiveDoubleClickEditHandler } from './immersiveReadingDoubleClick';
import { NodeLinkHoverPreviewPanel } from './NodeLinkHoverPreviewPanel';
import { useDocumentPanelDocumentRetry } from './useDocumentPanelDocumentRetry';
import { useDocumentPanelDraftProps } from './useDocumentPanelDraftProps';
import { useDocumentPanelFormulaClozePresentation } from './useDocumentPanelFormulaClozePresentation';
import { useDocumentPanelImageClozePresentation } from './useDocumentPanelImageClozePresentation';
import { useDocumentPanelPerformanceMarkers } from './useDocumentPanelPerformanceMarkers';
import { useDocumentPanelSourceUpdateState } from './useDocumentPanelSourceUpdateState';
import { useExternalLinkPanels } from './useExternalLinkPanels';
import { useNodeBacklinks } from './useNodeBacklinks';
import { useNodeLinkHoverPreview } from './useNodeLinkHoverPreview';

export type { DocumentPanelSectionProps } from './documentPanelSectionTypes';

function useDocumentPanelTextAnchorState(props: DocumentPanelSectionProps) {
  const previousDecorationsRef = useRef<ReturnType<typeof collectDocumentTextAnchorDecorations>>([]);
  return useMemo(() => {
    const nextDecorations = collectDocumentTextAnchorDecorations({
      activeNodeId: props.activeNodeId,
      nodesById: props.nodesById,
      parentContent: props.editorContent,
      trashedNodeIds: props.trashedNodeIds
    });
    const previousDecorations = previousDecorationsRef.current;
    const isSame =
      previousDecorations.length === nextDecorations.length &&
      previousDecorations.every((previousDecoration, index) => {
        const nextDecoration = nextDecorations[index];
        return (
          previousDecoration?.from === nextDecoration?.from &&
          previousDecoration?.to === nextDecoration?.to &&
          previousDecoration?.kind === nextDecoration?.kind &&
          previousDecoration?.nodeId === nextDecoration?.nodeId
        );
      });
    if (isSame) {
      return previousDecorations;
    }
    previousDecorationsRef.current = nextDecorations;
    return nextDecorations;
  }, [props.activeNodeId, props.editorContent, props.nodesById, props.trashedNodeIds]);
}

function useDocumentPanelClozePresentations(activeNode: Node | undefined, props: DocumentPanelSectionProps) {
  useDocumentPanelImageClozePresentation({
    activeNode,
    editorNodeId: props.editorNodeId,
    nodesById: props.nodesById,
    onOpenNode: props.onSelectNode,
    trashedNodeIds: props.trashedNodeIds
  });
  useDocumentPanelFormulaClozePresentation({
    activeNode,
    editorNodeId: props.editorNodeId,
    nodesById: props.nodesById,
    trashedNodeIds: props.trashedNodeIds
  });
}

function buildDocumentComparisonModel(
  state: ReturnType<typeof useDocumentPanelSourceUpdateState>
) {
  return {
    ...state,
    sourceUpdatePreview: state.sourceUpdatePreview.value
  };
}

function useDocumentPanelSectionModel(props: DocumentPanelSectionProps) {
  const t = useTranslation();
  const { editorDisplayMode, immersiveDoubleClickEditEnabled, readingContentWidth } = useAppearanceSettings();
  const { isRetryingDocument, retryDocumentLoad } = useDocumentPanelDocumentRetry(props.editorNodeId);
  const activeNode = props.activeNodeId ? props.nodesById[props.activeNodeId] : undefined;
  const { bodyProps, documentLayoutStyle, documentStatus, isFolderListView, loadingLabel, panelKind } = getDocumentPanelView(
    props,
    editorDisplayMode,
    readingContentWidth,
    t
  );
  const readingBodyProps = {
    ...bodyProps,
    onEditorDoubleClick: resolveImmersiveDoubleClickEditHandler(
      bodyProps.onEditorDoubleClick,
      immersiveDoubleClickEditEnabled
    )
  };
  const editorNode = props.editorNodeId ? props.nodesById[props.editorNodeId] : undefined;
  const isEditorDocumentLoaded = !props.editorNodeId || isNodeDocumentLoaded(editorNode);
  const textAnchorState = useDocumentPanelTextAnchorState(props);
  const comparison = buildDocumentComparisonModel(useDocumentPanelSourceUpdateState(props));
  const backlinks = useNodeBacklinks({
    targetNodeId: props.activeNodeId,
    nodeOrder: props.nodeOrder,
    nodesById: props.nodesById,
    trashedNodeIds: props.trashedNodeIds
  });
  const emptyContent = renderDocumentPanelEmptyContent({
    documentStatus,
    isRetryingDocument,
    loadingLabel,
    retryDocumentLoad,
    t
  });
  useDocumentPanelPerformanceMarkers(props, Boolean(bodyProps.emptyState), isEditorDocumentLoaded);
  useDocumentPanelClozePresentations(activeNode, props);

  return {
    bodyProps: readingBodyProps,
    documentAreaLabel: t('desktop.document.area'),
    documentLayoutStyle,
    emptyContent,
    textAnchorState,
    isFolderListView,
    panelKind,
    ...comparison,
    backlinks,
  };
}

export type DocumentPanelSectionModel = ReturnType<typeof useDocumentPanelSectionModel>;

export function DocumentPanelSection(props: DocumentPanelSectionProps) {
  recordComponentRender('documentPanel');
  useDocumentPanelSectionDiagnostic(props);
  const draftProps = useDocumentPanelDraftProps(props);
  const model = useDocumentPanelSectionModel(draftProps);
  const interactions = useDocumentPanelInteractions(draftProps);
  const nodeLinkPreview = useNodeLinkHoverPreview(draftProps);
  const resolvedProps = buildResolvedDocumentPanelProps(draftProps);
  const { handleCloseExternalLink, handleLinkPanelStateChange, handleOpenExternalLink, linkPanels } = useExternalLinkPanels();
  const topicBacklinks = buildTopicBacklinks({
    activeNodeId: draftProps.activeNodeId,
    backlinks: model.backlinks.value,
    nodesById: draftProps.nodesById
  });
  return (
    <section aria-label={model.documentAreaLabel} className="flex min-h-0 flex-1 flex-col" style={model.documentLayoutStyle}>
      <DocumentPanelSectionShell
        bodyProps={definedProps({
          ...model.bodyProps,
          onOpenExternalLink: handleOpenExternalLink,
          textAnchorDecorations: model.textAnchorState,
          onOpenNodeLink: interactions.handleOpenNodeLink,
          onPreviewNodeLink: nodeLinkPreview.handlePreviewNodeLink,
          emptyContent: model.emptyContent,
          ...definedProps({
            onEditorReady: interactions.handleEditorReady
          })
        })}
        backlinks={topicBacklinks}
        canOpenComparisonView={model.canOpenComparisonView}
        isFolderListView={model.isFolderListView}
        panelKind={model.panelKind}
        isSourceUpdatePanelOpen={model.isSourceUpdatePanelOpen}
        linkPanels={linkPanels}
        onCloseExternalLink={handleCloseExternalLink}
        onLinkPanelStateChange={handleLinkPanelStateChange}
        onOpenExternalLink={handleOpenExternalLink}
        onToggleSourceUpdatePanel={() =>
          model.handleSourceUpdatePanelOpenChange(!model.isSourceUpdatePanelOpen)
        }
        onPreviewTopicSearchDecorations={interactions.handlePreviewTopicSearchDecorations}
        props={{
          ...resolvedProps,
          onEditorReady: interactions.handleEditorReady
        }}
        onPreviewDocumentSelection={interactions.handlePreviewDocumentSelection}
        showSourceUpdateAction={model.canOpenComparisonView && Boolean(model.sourceUpdatePreview)}
      />
      <NodeLinkHoverPreviewPanel preview={nodeLinkPreview.preview} />
      <DocumentPanelSectionOverlayHost
        editorAdapter={interactions.editorAdapter}
        model={model}
        props={draftProps}
      />
    </section>
  );
}
