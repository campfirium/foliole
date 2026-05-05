import { EditorContextMenu } from './EditorContextMenu';
import type { WorkspaceEditorContextMenu } from './WorkspaceLayout';

interface DocumentPanelContextMenuProps {
  contextMenu: WorkspaceEditorContextMenu | null;
  onCloseContextMenu: () => void;
  onCopyImage: () => void;
  onCreateHighlight: () => void;
  onCreateNote: (note: string) => void;
  onDeleteExistingHighlight: () => void;
  onCreateCloze: () => void;
  onCutImage: () => void;
  onDeleteImage: () => void;
  onExportImage: () => void;
}

export function DocumentPanelContextMenu({
  contextMenu,
  onCloseContextMenu,
  onCopyImage,
  onCreateHighlight,
  onCreateNote,
  onDeleteExistingHighlight,
  onCreateCloze,
  onCutImage,
  onDeleteImage,
  onExportImage
}: DocumentPanelContextMenuProps) {
  if (!contextMenu) {
    return null;
  }

  return (
    <EditorContextMenu
      kind={contextMenu.kind}
      left={contextMenu.left}
      mode={contextMenu.mode}
      notePanelLeft={contextMenu.notePanelLeft}
      notePanelTop={contextMenu.notePanelTop}
      onClose={onCloseContextMenu}
      onCopyImage={onCopyImage}
      onCreateCloze={onCreateCloze}
      onCreateHighlight={onCreateHighlight}
      onCreateNote={onCreateNote}
      onDeleteExistingHighlight={onDeleteExistingHighlight}
      onCutImage={onCutImage}
      onDeleteImage={onDeleteImage}
      onExportImage={onExportImage}
      top={contextMenu.top}
    />
  );
}
