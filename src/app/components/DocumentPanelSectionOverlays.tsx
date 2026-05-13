import { DocumentPanelContextMenu } from './DocumentPanelContextMenu';
import type { DocumentPanelSectionProps } from './DocumentPanelSection';
import { DocumentPanelSourceUpdatePanel } from './DocumentPanelSourceUpdatePanel';

interface DocumentPanelSectionOverlaysProps {
  currentSourceUpdateContent: string;
  documentMaxWidth: number;
  handleSourceUpdateDraftChange: (content: string) => void;
  handleSourceUpdatePanelOpenChange: (open: boolean) => void;
  isSourceUpdatePanelOpen: boolean;
  props: DocumentPanelSectionProps;
  sourceUpdatePreview: { currentHighlightCount: number; updatedContent: string; updatedHighlightCount: number } | null;
}

export function DocumentPanelSectionOverlays({
  currentSourceUpdateContent,
  documentMaxWidth,
  handleSourceUpdateDraftChange,
  handleSourceUpdatePanelOpenChange,
  isSourceUpdatePanelOpen,
  props,
  sourceUpdatePreview
}: DocumentPanelSectionOverlaysProps) {
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
