import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { isTextAnchorLocator } from '../../features/nodes/model/nodeTypes';

import type { DocumentComparisonMode } from './documentComparisonView';
import { DocumentPanelContextMenu } from './DocumentPanelContextMenu';
import type { DocumentPanelSectionProps } from './DocumentPanelSection';
import { DocumentPanelSourceUpdatePanel } from './DocumentPanelSourceUpdatePanel';
import { HighlightRangeHandles } from './HighlightRangeHandles';
import { ImageExcerptAnnotationCreation } from './ImageExcerptAnnotationCreation';

export interface DocumentPanelSectionOverlaysProps {
  currentSourceUpdateContent: string;
  comparisonMode: DocumentComparisonMode;
  comparisonSource: 'manual' | 'source';
  documentMaxWidth: number;
  editorAdapter: EditorAdapter | null;
  handleIncomingUpdateAccept?: () => Promise<void>;
  handleIncomingUpdateDismiss?: () => Promise<void>;
  handleIncomingUpdateImportAsNew?: () => Promise<void>;
  handleManualContentChange: (content: string) => void;
  handleManualSaveAsTopic: () => Promise<void>;
  handleManualSetAsBody: () => Promise<void>;
  handleSourceUpdateDraftChange: (content: string) => void;
  handleSourceUpdatePanelOpenChange: (open: boolean) => void;
  isSourceUpdatePanelOpen: boolean;
  manualContent: string;
  setComparisonSource: (source: 'manual' | 'source') => void;
  props: DocumentPanelSectionProps;
  sourceUpdatePreview: { currentHighlightCount: number; updatedContent: string; updatedHighlightCount: number } | null;
}

export function resolveAdjustableHighlight(props: DocumentPanelSectionProps) {
  const existingHighlight = props.contextMenu?.existingHighlight;
  if (
    (existingHighlight?.kind !== 'highlight' && existingHighlight?.kind !== 'cloze') ||
    !existingHighlight.canAdjustRange
  ) {
    return null;
  }
  const node = props.nodesById[existingHighlight.nodeId];
  if (node?.anchorLink?.kind !== existingHighlight.kind || !isTextAnchorLocator(node.anchorLink.locator)) {
    return null;
  }
  return {
    ...existingHighlight,
    kind: existingHighlight.kind,
    locator: node.anchorLink.locator,
    originalText: node.anchorLink.locator.originalText
  };
}

function renderComparisonPanel(props: DocumentPanelSectionOverlaysProps) {
  if (!props.isSourceUpdatePanelOpen) return null;
  const preview = props.sourceUpdatePreview;
  return (
    <DocumentPanelSourceUpdatePanel
      comparisonMode={props.comparisonMode}
      comparisonSource={props.comparisonSource}
      currentContent={props.currentSourceUpdateContent}
      currentHighlightCount={preview?.currentHighlightCount ?? 0}
      documentMaxWidth={props.documentMaxWidth}
      editorAppearanceKey={props.props.editorAppearanceKey}
      editorNodeId={props.props.editorNodeId}
      {...(props.handleIncomingUpdateAccept ? { onAcceptIncomingUpdate: props.handleIncomingUpdateAccept } : {})}
      onCurrentContentChange={props.handleSourceUpdateDraftChange}
      {...(props.handleIncomingUpdateDismiss ? { onDismissIncomingUpdate: props.handleIncomingUpdateDismiss } : {})}
      {...(props.handleIncomingUpdateImportAsNew ? { onImportIncomingUpdateAsNew: props.handleIncomingUpdateImportAsNew } : {})}
      onOpenChange={props.handleSourceUpdatePanelOpenChange}
      manualContent={props.manualContent}
      onManualContentChange={props.handleManualContentChange}
      onManualSaveAsTopic={props.handleManualSaveAsTopic}
      onManualSetAsBody={props.handleManualSetAsBody}
      onSourceChange={props.setComparisonSource}
      open
      sourceAvailable={Boolean(preview)}
      updatedHighlightCount={preview?.updatedHighlightCount ?? 0}
      updatedContent={props.comparisonMode === 'manual' ? props.manualContent : preview?.updatedContent ?? ''}
    />
  );
}

export function DocumentPanelSectionOverlays(args: DocumentPanelSectionOverlaysProps) {
  const { editorAdapter, props } = args;
  const adjustableHighlight = resolveAdjustableHighlight(props);
  return (
    <>
      {renderComparisonPanel(args)}
      <HighlightRangeHandles
        editor={editorAdapter}
        highlight={adjustableHighlight}
        onCommit={props.onAdjustExistingHighlightRange}
      />
      <ImageExcerptAnnotationCreation
        activeNodeId={props.activeNodeId}
        editor={editorAdapter}
        editorNodeId={props.editorNodeId}
      />
      <DocumentPanelContextMenu
        contextMenu={props.contextMenu}
        onCloseContextMenu={props.onCloseContextMenu}
        onCopyImage={props.onCopyImage}
        onCreateCloze={props.onCreateCloze}
        {...(props.onCreateClozeFromPayload ? { onCreateClozeFromPayload: props.onCreateClozeFromPayload } : {})}
        onCreateHighlight={props.onCreateHighlight}
        {...(props.onCreateHighlightFromPayload ? { onCreateHighlightFromPayload: props.onCreateHighlightFromPayload } : {})}
        onCreateNote={props.onCreateNote ?? (() => undefined)}
        onDeleteExistingHighlight={props.onDeleteExistingHighlight ?? (() => undefined)}
        onOpenExistingHighlight={props.onOpenExistingHighlight ?? (() => undefined)}
        onRepairTable={props.onRepairTable ?? (() => false)}
        onCutImage={props.onCutImage}
        onDeleteImage={props.onDeleteImage}
        onExportImage={props.onExportImage}
      />
    </>
  );
}
