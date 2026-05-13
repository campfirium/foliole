import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';

import { collectDocumentTextAnchorDecorations } from '../../features/editor/model/documentTextAnchorDecorations';
import { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import {
  markDocumentPanelBound,
  markNodeBodyPainted,
  markNodeBodyReady,
  recordComponentRender
} from '../../shared/platform/performanceDiagnosticsProbe';
import { definedProps } from '../../shared/lib/definedProps';
import { isNodeDocumentLoaded } from '../../store/workspaceRendererBoundary';
import { useEditorDraftSync } from '../hooks/useEditorDraftSync';

import { DocumentPanelLoadingContent } from './DocumentPanelLoadingContent';
import { getDocumentPanelView } from './documentPanelSectionModel';
import { DocumentPanelSectionOverlays } from './DocumentPanelSectionOverlays';
import { DocumentPanelSectionShell } from './DocumentPanelSectionShell';
import {
  buildResolvedDocumentPanelProps,
  buildTopicBacklinks,
  useDocumentPanelInteractions
} from './documentPanelSectionSupport';
import type { DocumentPanelSectionProps } from './documentPanelSectionTypes';
import { NodeLinkHoverPreviewPanel } from './NodeLinkHoverPreviewPanel';
import { useDocumentPanelImageClozePresentation } from './useDocumentPanelImageClozePresentation';
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
          previousDecoration?.kind === nextDecoration?.kind
        );
      });
    if (isSame) {
      return previousDecorations;
    }
    previousDecorationsRef.current = nextDecorations;
    return nextDecorations;
  }, [props.activeNodeId, props.editorContent, props.nodesById, props.trashedNodeIds]);
}

function useDocumentPanelSectionModel(props: DocumentPanelSectionProps) {
  const { editorDisplayMode, readingContentWidth } = useAppearanceSettings();
  const activeNode = props.activeNodeId ? props.nodesById[props.activeNodeId] : undefined;
  const { bodyProps, documentLayoutStyle, isFolderListView, loadingLabel } = getDocumentPanelView(
    props,
    editorDisplayMode,
    readingContentWidth
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
    ...(props.onRegisterEditorDraftFlush ? { onRegisterFlush: props.onRegisterEditorDraftFlush } : {})
  });
  return useMemo(
    () => ({
      ...props,
      editorContent: editorDraft.editorContent,
      onEditorChange: editorDraft.handleEditorChange
    }),
    [editorDraft.editorContent, editorDraft.handleEditorChange, props]
  );
}

export function DocumentPanelSection(props: DocumentPanelSectionProps) {
  recordComponentRender('documentPanel');
  const draftProps = useDocumentPanelDraftProps(props);
  const model = useDocumentPanelSectionModel(draftProps);
  const interactions = useDocumentPanelInteractions(draftProps);
  const nodeLinkPreview = useNodeLinkHoverPreview(draftProps);
  const resolvedProps = buildResolvedDocumentPanelProps(draftProps);
  const { handleCloseExternalLink, handleLinkPanelStateChange, handleOpenExternalLink, linkPanels } = useExternalLinkPanels();
  const topicBacklinks = buildTopicBacklinks({
    activeNodeId: draftProps.activeNodeId,
    backlinks: model.backlinks,
    nodesById: draftProps.nodesById
  });
  return (
    <section aria-label="Document area" className="flex min-h-0 flex-1 flex-col" style={model.documentLayoutStyle}>
      <DocumentPanelSectionShell
        bodyProps={{
          onOpenExternalLink: handleOpenExternalLink,
          textAnchorDecorations: model.textAnchorState,
          onOpenNodeLink: interactions.handleOpenNodeLink,
          onPreviewNodeLink: nodeLinkPreview.handlePreviewNodeLink,
          ...definedProps({
            ...model.bodyProps,
            emptyContent: model.emptyContent,
            onEditorReady: interactions.handleEditorReady
          })
        }}
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
        handleSourceUpdateDraftChange={model.handleSourceUpdateDraftChange}
        handleSourceUpdatePanelOpenChange={model.handleSourceUpdatePanelOpenChange}
        isSourceUpdatePanelOpen={model.isSourceUpdatePanelOpen}
        props={draftProps}
        sourceUpdatePreview={model.sourceUpdatePreview}
      />
    </section>
  );
}
