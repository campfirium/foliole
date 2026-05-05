import { AppDropdownMenu, AppDropdownMenuContent, AppDropdownMenuItem, AppDropdownMenuTrigger } from '@/shared/ui';

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
    <AppDropdownMenu onOpenChange={(open) => (open ? undefined : onClose())} open>
      <AppDropdownMenuTrigger asChild>
        <button
          aria-hidden="true"
          className="pointer-events-none fixed h-0 w-0 opacity-0"
          style={{ left: `${left}px`, top: `${top}px` }}
          type="button"
        />
      </AppDropdownMenuTrigger>
      <AppDropdownMenuContent
        align="start"
        onCloseAutoFocus={(event) => event.preventDefault()}
        onContextMenu={(event) => event.preventDefault()}
        sideOffset={0}
        style={{ left: `${left}px`, position: 'fixed', top: `${top}px` }}
      >
        <AppDropdownMenuItem disabled={!canRunCommands} onSelect={onCreateHighlight}>
          Highlight
        </AppDropdownMenuItem>
        <AppDropdownMenuItem disabled={!canRunCommands} onSelect={onCreateCloze}>
          Cloze
        </AppDropdownMenuItem>
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}
