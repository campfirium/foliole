import { ImageClozeComposerDialog } from '../../features/image-cloze/components/ImageClozeComposerDialog';

import type { DocumentPanelSectionProps } from './DocumentPanelSection';
import { DocumentPanelContextMenu } from './DocumentPanelSectionParts';
import { DocumentPanelSourceUpdatePanel } from './DocumentPanelSourceUpdatePanel';

interface DocumentPanelSectionOverlaysProps {
  currentSourceUpdateContent: string;
  handleSourceUpdateDraftChange: (content: string) => void;
  handleSourceUpdatePanelOpenChange: (open: boolean) => void;
  isSourceUpdatePanelOpen: boolean;
  props: DocumentPanelSectionProps;
  sourceUpdatePreview: { updatedContent: string } | null;
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
          documentMaxWidth={props.documentMaxWidth}
          editorAppearanceKey={props.editorAppearanceKey}
          editorNodeId={props.editorNodeId}
          onCurrentContentChange={handleSourceUpdateDraftChange}
          onOpenChange={handleSourceUpdatePanelOpenChange}
          open={isSourceUpdatePanelOpen}
          updatedContent={sourceUpdatePreview.updatedContent}
        />
      ) : null}
      <DocumentPanelContextMenu
        contextMenu={props.contextMenu}
        onCloseContextMenu={props.onCloseContextMenu}
        onCopyImage={props.onCopyImage}
        onCreateCloze={props.onCreateCloze}
        onCreateHighlight={props.onCreateHighlight}
        onCreateImageCloze={props.onCreateImageCloze ?? (() => undefined)}
        onCutImage={props.onCutImage}
        onDeleteImage={props.onDeleteImage}
        onExportImage={props.onExportImage}
      />
      <ImageClozeComposerDialog
        attachmentId={props.imageClozeComposerAttachmentId ?? null}
        onClose={props.onCloseImageClozeComposer ?? (() => undefined)}
        onSave={props.onSaveImageCloze ?? (() => [])}
      />
    </>
  );
}
