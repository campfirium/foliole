import { DocumentPanelContextMenu } from './DocumentPanelContextMenu';
import type { DocumentPanelSectionProps } from './DocumentPanelSection';
import { DocumentPanelSourceUpdatePanel } from './DocumentPanelSourceUpdatePanel';

interface DocumentPanelSectionOverlaysProps {
  currentSourceUpdateContent: string;
  handleSourceUpdateDraftChange: (content: string) => void;
  handleSourceUpdatePanelOpenChange: (open: boolean) => void;
  isSourceUpdatePanelOpen: boolean;
  props: DocumentPanelSectionProps;
  sourceUpdatePreview: { currentHighlightCount: number; updatedContent: string; updatedHighlightCount: number } | null;
}

export function DocumentPanelSectionOverlays({
  currentSourceUpdateContent,
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
          documentMaxWidth={props.documentMaxWidth}
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
        onCreateHighlight={props.onCreateHighlight}
        onCreateNote={props.onCreateNote ?? (() => undefined)}
        onDeleteExistingHighlight={props.onDeleteExistingHighlight ?? (() => undefined)}
        onCutImage={props.onCutImage}
        onDeleteImage={props.onDeleteImage}
        onExportImage={props.onExportImage}
      />
    </>
  );
}
