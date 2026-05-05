import { AppSelectionDropdownMenu, AppSelectionDropdownMenuItem } from '@/shared/ui';

export interface EditorContextMenuProps {
  canRunCommands: boolean;
  left: number;
  top: number;
  onClose: () => void;
  onCreateHighlight: () => void;
  onCreateCloze: () => void;
}

export function EditorContextMenu({
  canRunCommands,
  left,
  top,
  onClose,
  onCreateHighlight,
  onCreateCloze
}: EditorContextMenuProps) {
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
