import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';

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
  const existingHighlight = props.contextMenu?.existingHighlight;
  const adjustableHighlight = existingHighlight?.kind === 'highlight' && existingHighlight.canAdjustRange ? existingHighlight : null;
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
        onCommit={props.onAdjustExistingHighlightRange ?? (() => false)}
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
        onCutImage={props.onCutImage}
        onDeleteImage={props.onDeleteImage}
        onExportImage={props.onExportImage}
      />
    </>
  );
}
