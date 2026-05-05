import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface NodeListContextMenuProps {
  isTrashMenu: boolean;
  left: number;
  onClose: () => void;
  onDeleteNode: () => void;
  onDeleteNodePermanently: () => void;
  onRestoreNode: () => void;
  top: number;
}

export function NodeListContextMenu({
  isTrashMenu,
  left,
  onClose,
  onDeleteNode,
  onDeleteNodePermanently,
  onRestoreNode,
  top
}: NodeListContextMenuProps) {
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
        {isTrashMenu ? (
          <>
            <DropdownMenuItem onSelect={onRestoreNode}>Restore</DropdownMenuItem>
            <DropdownMenuItem onSelect={onDeleteNodePermanently}>Delete Permanently</DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem onSelect={onDeleteNode}>Delete Node</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
