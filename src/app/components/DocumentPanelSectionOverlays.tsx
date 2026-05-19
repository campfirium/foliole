import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { isTextAnchorLocator } from '../../features/nodes/model/nodeTypes';

import { DocumentPanelContextMenu } from './DocumentPanelContextMenu';
import type { DocumentPanelSectionProps } from './DocumentPanelSection';
import { DocumentPanelSourceUpdatePanel } from './DocumentPanelSourceUpdatePanel';
import { HighlightRangeHandles } from './HighlightRangeHandles';

interface DocumentPanelSectionOverlaysProps {
  currentSourceUpdateContent: string;
  documentMaxWidth: number;
  editorAdapter: EditorAdapter | null;
  handleSourceUpdateDraftChange: (content: string) => void;
  handleSourceUpdatePanelOpenChange: (open: boolean) => void;
  isSourceUpdatePanelOpen: boolean;
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
    locator: node.anchorLink.locator,
    originalText: node.anchorLink.locator.originalText
  };
}

export function DocumentPanelSectionOverlays({
  currentSourceUpdateContent,
  documentMaxWidth,
  editorAdapter,
  handleSourceUpdateDraftChange,
  handleSourceUpdatePanelOpenChange,
  isSourceUpdatePanelOpen,
  props,
  sourceUpdatePreview
}: DocumentPanelSectionOverlaysProps) {
  const adjustableHighlight = resolveAdjustableHighlight(props);
  return (
    <>
      {sourceUpdatePreview ? (
        <DocumentPanelSourceUpdatePanel
          currentContent={currentSourceUpdateContent}
          currentHighlightCount={sourceUpdatePreview.currentHighlightCount}
          documentMaxWidth={documentMaxWidth}
          editorAppearanceKey={props.editorAppearanceKey}
          editorNodeId={props.editorNodeId}
          onCurrentContentChange={handleSourceUpdateDraftChange}
          onOpenChange={handleSourceUpdatePanelOpenChange}
          open={isSourceUpdatePanelOpen}
          updatedHighlightCount={sourceUpdatePreview.updatedHighlightCount}
          updatedContent={sourceUpdatePreview.updatedContent}
        />
      ) : null}
      <HighlightRangeHandles
        editor={editorAdapter}
        highlight={adjustableHighlight}
        onCommit={props.onAdjustExistingHighlightRange}
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
        onRepairTable={props.onRepairTable}
        onCutImage={props.onCutImage}
        onDeleteImage={props.onDeleteImage}
        onExportImage={props.onExportImage}
      />
    </>
  );
}
