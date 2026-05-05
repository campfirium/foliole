import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

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
    <DropdownMenu onOpenChange={(open) => (open ? undefined : onClose())} open>
      <DropdownMenuTrigger asChild>
        <button
          aria-hidden="true"
          className="pointer-events-none fixed h-0 w-0 opacity-0"
          style={{ left: `${left}px`, top: `${top}px` }}
          type="button"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        onCloseAutoFocus={(event) => event.preventDefault()}
        onContextMenu={(event) => event.preventDefault()}
        sideOffset={0}
        style={{ left: `${left}px`, position: 'fixed', top: `${top}px` }}
      >
        <DropdownMenuItem disabled={!canRunCommands} onSelect={onCreateHighlight}>
          Highlight
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canRunCommands} onSelect={onCreateCloze}>
          Cloze
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
