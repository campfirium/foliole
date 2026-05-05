import { AppDropdownMenu, AppDropdownMenuContent, AppDropdownMenuItem, AppDropdownMenuTrigger } from '@/shared/ui';

interface NodeListContextMenuProps {
  isTrashMenu: boolean;
  left: number;
  onCreateChildNode?: () => void;
  onClose: () => void;
  onCreateNode: () => void;
  onDeleteNode: () => void;
  onDeleteNodePermanently: () => void;
  onDismissNode?: () => void;
  onImportIntoNode?: () => void;
  onPasteIntoNode?: () => void;
  onReturnNode?: () => void;
  onRestoreNode: () => void;
  showDismissAction?: boolean;
  showImportIntoNodeAction?: boolean;
  showPasteIntoNodeAction?: boolean;
  showReturnAction?: boolean;
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
  onDismissNode,
  onImportIntoNode,
  onPasteIntoNode,
  onReturnNode,
  onRestoreNode,
  showDismissAction = false,
  showImportIntoNodeAction = false,
  showPasteIntoNodeAction = false,
  showReturnAction = false,
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
        {isTrashMenu ? <TrashMenuItems onDeleteNodePermanently={onDeleteNodePermanently} onRestoreNode={onRestoreNode} /> : null}
        {!isTrashMenu ? (
          <NoteMenuItems
            onCreateChildNode={onCreateChildNode}
            onCreateNode={onCreateNode}
            onDeleteNode={onDeleteNode}
            onDismissNode={onDismissNode}
            onImportIntoNode={onImportIntoNode}
            onPasteIntoNode={onPasteIntoNode}
            onReturnNode={onReturnNode}
            showDismissAction={showDismissAction}
            showImportIntoNodeAction={showImportIntoNodeAction}
            showPasteIntoNodeAction={showPasteIntoNodeAction}
            showReturnAction={showReturnAction}
          />
        ) : null}
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}

function TrashMenuItems({
  onDeleteNodePermanently,
  onRestoreNode
}: {
  onDeleteNodePermanently: () => void;
  onRestoreNode: () => void;
}) {
  return (
    <>
      <AppDropdownMenuItem onSelect={onRestoreNode}>Restore</AppDropdownMenuItem>
      <AppDropdownMenuItem onSelect={onDeleteNodePermanently}>Delete Permanently</AppDropdownMenuItem>
    </>
  );
}

function NoteMenuItems({
  onCreateChildNode,
  onCreateNode,
  onDeleteNode,
  onDismissNode,
  onImportIntoNode,
  onPasteIntoNode,
  onReturnNode,
  showDismissAction,
  showImportIntoNodeAction,
  showPasteIntoNodeAction,
  showReturnAction
}: Omit<NodeListContextMenuProps, 'isTrashMenu' | 'left' | 'onClose' | 'onDeleteNodePermanently' | 'onRestoreNode' | 'top'>) {
  return (
    <>
      <AppDropdownMenuItem onSelect={onCreateNode}>New Node</AppDropdownMenuItem>
      {onCreateChildNode ? <AppDropdownMenuItem onSelect={onCreateChildNode}>New Child Node</AppDropdownMenuItem> : null}
      {showReturnAction && onReturnNode ? <AppDropdownMenuItem onSelect={onReturnNode}>Relearn</AppDropdownMenuItem> : null}
      {showDismissAction && onDismissNode ? <AppDropdownMenuItem onSelect={onDismissNode}>Dismiss</AppDropdownMenuItem> : null}
      {showImportIntoNodeAction ? (
        <AppDropdownMenuItem onSelect={onImportIntoNode}>
          Import into this node *
        </AppDropdownMenuItem>
      ) : null}
      {showPasteIntoNodeAction ? (
        <AppDropdownMenuItem onSelect={onPasteIntoNode}>
          Paste into this node *
        </AppDropdownMenuItem>
      ) : null}
      <AppDropdownMenuItem onSelect={onDeleteNode}>Delete Node</AppDropdownMenuItem>
    </>
  );
}
