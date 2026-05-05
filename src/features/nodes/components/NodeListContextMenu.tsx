import { AppDropdownMenu, AppDropdownMenuContent, AppDropdownMenuItem, AppDropdownMenuTrigger } from '@/shared/ui';

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
        {isTrashMenu ? (
          <>
            <AppDropdownMenuItem onSelect={onRestoreNode}>Restore</AppDropdownMenuItem>
            <AppDropdownMenuItem onSelect={onDeleteNodePermanently}>Delete Permanently</AppDropdownMenuItem>
          </>
        ) : (
          <AppDropdownMenuItem onSelect={onDeleteNode}>Delete Node</AppDropdownMenuItem>
        )}
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}
