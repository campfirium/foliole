import { AppDropdownMenu, AppDropdownMenuContent, AppDropdownMenuItem, AppDropdownMenuTrigger } from '@/shared/ui';

interface NodeListContextMenuProps {
  isTrashMenu: boolean;
  left: number;
  onCreateChildNode?: () => void;
  onClose: () => void;
  onCreateNode: () => void;
  onDeleteNode: () => void;
  onDeleteNodePermanently: () => void;
  onRelearnNode?: () => void;
  onRestoreNode: () => void;
  showRelearnAction?: boolean;
  top: number;
}

export function NodeListContextMenu({
  isTrashMenu,
  left,
  onCreateChildNode,
  onClose,
  onCreateNode,
  onDeleteNode,
  onDeleteNodePermanently,
  onRelearnNode,
  onRestoreNode,
  showRelearnAction = false,
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
      >
        {isTrashMenu ? (
          <>
            <AppDropdownMenuItem onSelect={onRestoreNode}>Restore</AppDropdownMenuItem>
            <AppDropdownMenuItem onSelect={onDeleteNodePermanently}>Delete Permanently</AppDropdownMenuItem>
          </>
        ) : (
          <>
            <AppDropdownMenuItem onSelect={onCreateNode}>New Node</AppDropdownMenuItem>
            {onCreateChildNode ? (
              <AppDropdownMenuItem onSelect={onCreateChildNode}>New Child Node</AppDropdownMenuItem>
            ) : null}
            {showRelearnAction && onRelearnNode ? (
              <AppDropdownMenuItem onSelect={onRelearnNode}>Relearn</AppDropdownMenuItem>
            ) : null}
            <AppDropdownMenuItem onSelect={onDeleteNode}>Delete Node</AppDropdownMenuItem>
          </>
        )}
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}
