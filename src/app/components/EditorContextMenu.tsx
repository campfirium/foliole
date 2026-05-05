import { AppSelectionDropdownMenu, AppSelectionDropdownMenuItem } from '@/shared/ui';

export interface EditorContextMenuProps {
  canRunCommands?: boolean;
  kind: 'image' | 'selection';
  left: number;
  top: number;
  onClose: () => void;
  onCopyImage: () => void;
  onCreateHighlight: () => void;
  onCreateCloze: () => void;
  onCutImage: () => void;
  onDeleteImage: () => void;
  onExportImage: () => void;
}

export function EditorContextMenu({
  canRunCommands,
  kind,
  left,
  top,
  onClose,
  onCopyImage,
  onCreateHighlight,
  onCreateCloze,
  onCutImage,
  onDeleteImage,
  onExportImage
}: EditorContextMenuProps) {
  if (kind === 'image') {
    return (
      <AppSelectionDropdownMenu left={left} onClose={onClose} top={top}>
        <AppSelectionDropdownMenuItem onClick={onCopyImage}>Copy image</AppSelectionDropdownMenuItem>
        <AppSelectionDropdownMenuItem onClick={onCutImage}>Cut image</AppSelectionDropdownMenuItem>
        <AppSelectionDropdownMenuItem onClick={onExportImage}>Export image</AppSelectionDropdownMenuItem>
        <AppSelectionDropdownMenuItem onClick={onDeleteImage}>Delete image</AppSelectionDropdownMenuItem>
      </AppSelectionDropdownMenu>
    );
  }

  return (
    <AppSelectionDropdownMenu left={left} onClose={onClose} top={top}>
      <AppSelectionDropdownMenuItem disabled={!canRunCommands} onClick={onCreateHighlight}>
        Highlight
      </AppSelectionDropdownMenuItem>
      <AppSelectionDropdownMenuItem disabled={!canRunCommands} onClick={onCreateCloze}>
        Cloze
      </AppSelectionDropdownMenuItem>
    </AppSelectionDropdownMenu>
  );
}
