import { useCallback, useMemo, useRef } from 'react';

import { collectDocumentTextAnchorDecorations } from '../../features/editor/model/documentTextAnchorDecorations';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import { definedProps } from '../../shared/lib/definedProps';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  recordComponentRender
} from '../../shared/platform/performanceDiagnosticsProbe';
import { isNodeDocumentLoaded } from '../../store/workspaceRendererBoundary';
import { useEditorDraftSync } from '../hooks/useEditorDraftSync';

import { useDocumentPanelSectionDiagnostic } from './documentPanelSectionDiagnostic';
import { getDocumentPanelView } from './documentPanelSectionModel';
import { DocumentPanelSectionOverlays } from './DocumentPanelSectionOverlays';
import { DocumentPanelSectionShell } from './DocumentPanelSectionShell';
import {
  buildResolvedDocumentPanelProps,
  buildTopicBacklinks,
  renderDocumentPanelEmptyContent,
  useDocumentPanelInteractions
} from './documentPanelSectionSupport';
import type { DocumentPanelSectionProps } from './documentPanelSectionTypes';
import { NodeLinkHoverPreviewPanel } from './NodeLinkHoverPreviewPanel';
import { useDocumentPanelDocumentRetry } from './useDocumentPanelDocumentRetry';
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
    trashedNodeIds: props.trashedNodeIds
  });
  useDocumentPanelFormulaClozePresentation({
    activeNode,
    editorNodeId: props.editorNodeId,
    nodesById: props.nodesById,
    trashedNodeIds: props.trashedNodeIds
  });
}

function useDocumentPanelSectionModel(props: DocumentPanelSectionProps) {
  const t = useTranslation();
  const { editorDisplayMode, readingContentWidth } = useAppearanceSettings();
  const { isRetryingDocument, retryDocumentLoad } = useDocumentPanelDocumentRetry(props.editorNodeId);
  const activeNode = props.activeNodeId ? props.nodesById[props.activeNodeId] : undefined;
  const { bodyProps, documentLayoutStyle, documentStatus, isFolderListView, loadingLabel } = getDocumentPanelView(
    props,
    editorDisplayMode,
    readingContentWidth,
    t
  );
  const editorNode = props.editorNodeId ? props.nodesById[props.editorNodeId] : undefined;
  const isEditorDocumentLoaded = !props.editorNodeId || isNodeDocumentLoaded(editorNode);
  const textAnchorState = useDocumentPanelTextAnchorState(props);
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
    bodyProps,
    documentAreaLabel: t('desktop.document.area'),
    documentLayoutStyle,
    emptyContent,
    textAnchorState,
    isFolderListView,
    isSourceUpdatePanelOpen,
    currentSourceUpdateContent,
    backlinks,
    handleSourceUpdateDraftChange,
    handleSourceUpdatePanelOpenChange,
    sourceUpdatePreview: sourceUpdatePreview.value
  };
}

function useDocumentPanelDraftProps(props: DocumentPanelSectionProps) {
  const commitEditorContent = useCallback((nodeId: string | null, content: string) => {
    if (nodeId) {
      props.onNodeContentChange(nodeId, content);
      return;
    }
    props.onEditorChange(content);
  }, [props.onEditorChange, props.onNodeContentChange]);
  const editorDraft = useEditorDraftSync({
    committedContent: props.editorContent,
    nodeId: props.editorNodeId,
    onCommit: commitEditorContent,
    ...(props.onFinalizeNodeTitle ? { onFinalizeNode: props.onFinalizeNodeTitle } : {}),
    ...(props.onRegisterEditorDraftFlush ? { onRegisterFlush: props.onRegisterEditorDraftFlush } : {})
  });
  const handleEditorUndo = useCallback(() => {
    editorDraft.flushDraft();
    return props.onEditorUndo?.() ?? false;
  }, [editorDraft.flushDraft, props.onEditorUndo]);
  const handleEditorRedo = useCallback(() => {
    editorDraft.flushDraft();
    return props.onEditorRedo?.() ?? false;
  }, [editorDraft.flushDraft, props.onEditorRedo]);
  return useMemo(
    () => ({
      ...props,
      editorContent: editorDraft.editorContent,
      onEditorChange: editorDraft.handleEditorChange,
      onEditorInput: editorDraft.handleEditorInput,
      onEditorUndo: handleEditorUndo,
      onEditorRedo: handleEditorRedo
    }),
    [editorDraft.editorContent, editorDraft.handleEditorChange, editorDraft.handleEditorInput, handleEditorRedo, handleEditorUndo, props]
  );
}

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
        isFolderListView={model.isFolderListView}
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
        showSourceUpdateAction={Boolean(model.sourceUpdatePreview)}
      />
      <NodeLinkHoverPreviewPanel preview={nodeLinkPreview.preview} />
      <DocumentPanelSectionOverlays
        currentSourceUpdateContent={model.currentSourceUpdateContent}
        documentMaxWidth={model.bodyProps.documentMaxWidth}
        editorAdapter={interactions.editorAdapter}
        handleSourceUpdateDraftChange={model.handleSourceUpdateDraftChange}
        handleSourceUpdatePanelOpenChange={model.handleSourceUpdatePanelOpenChange}
        isSourceUpdatePanelOpen={model.isSourceUpdatePanelOpen}
        props={draftProps}
        sourceUpdatePreview={model.sourceUpdatePreview}
      />
    </section>
  );
}
