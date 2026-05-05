import { FOLDER_TOPIC_ITEM_COMMANDS } from '../../../../lib/core/nodes/folderTopicItemCommands';

import { AppDropdownMenu, AppDropdownMenuContent, AppDropdownMenuItem, AppDropdownMenuTrigger } from '@/shared/ui';

interface NodeListContextMenuProps {
  isTrashMenu: boolean;
  left: number;
  onClose: () => void;
  onCreateCommand: (commandId: string) => void;
  onDeleteNode: () => void;
  onDeleteNodePermanently: () => void;
  onDismissNode?: () => void;
  onImportIntoNode?: () => void;
  onMoveToNode?: () => void;
  onPasteIntoNode?: () => void;
  onReturnNode?: () => void;
  onRestoreNode: () => void;
  showDeleteAction?: boolean;
  showDismissAction?: boolean;
  showImportIntoNodeAction?: boolean;
  showMoveToNodeAction?: boolean;
  showPasteIntoNodeAction?: boolean;
  showRootCreateOnly?: boolean;
  showReturnAction?: boolean;
  top: number;
}

function renderMenuItems(props: NodeListContextMenuProps) {
  if (props.isTrashMenu) {
    return <TrashMenuItems onDeleteNodePermanently={props.onDeleteNodePermanently} onRestoreNode={props.onRestoreNode} />;
  }
  return (
    <NoteMenuItems
      onCreateCommand={props.onCreateCommand}
      onDeleteNode={props.onDeleteNode}
      onDismissNode={props.onDismissNode}
      onImportIntoNode={props.onImportIntoNode}
      onMoveToNode={props.onMoveToNode}
      onPasteIntoNode={props.onPasteIntoNode}
      onReturnNode={props.onReturnNode}
      showDeleteAction={props.showDeleteAction}
      showDismissAction={props.showDismissAction}
      showImportIntoNodeAction={props.showImportIntoNodeAction}
      showMoveToNodeAction={props.showMoveToNodeAction}
      showPasteIntoNodeAction={props.showPasteIntoNodeAction}
      showRootCreateOnly={props.showRootCreateOnly}
      showReturnAction={props.showReturnAction}
    />
  );
}

export function NodeListContextMenu(props: NodeListContextMenuProps) {
  const { left, onClose, top } = props;
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
        {renderMenuItems(props)}
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
  onCreateCommand,
  onDeleteNode,
  onDismissNode,
  onImportIntoNode,
  onMoveToNode,
  onPasteIntoNode,
  onReturnNode,
  showDeleteAction,
  showDismissAction,
  showImportIntoNodeAction,
  showMoveToNodeAction,
  showPasteIntoNodeAction,
  showRootCreateOnly,
  showReturnAction
}: Omit<NodeListContextMenuProps, 'isTrashMenu' | 'left' | 'onClose' | 'onDeleteNodePermanently' | 'onRestoreNode' | 'top'>) {
  return (
    <>
      {FOLDER_TOPIC_ITEM_COMMANDS.map((command) => (
        <AppDropdownMenuItem key={command.appCommandId} onSelect={() => onCreateCommand(command.appCommandId)}>
          {command.listLabel}
        </AppDropdownMenuItem>
      ))}
      {showRootCreateOnly ? null : showReturnAction && onReturnNode ? <AppDropdownMenuItem onSelect={onReturnNode}>Relearn</AppDropdownMenuItem> : null}
      {showRootCreateOnly ? null : showDismissAction && onDismissNode ? <AppDropdownMenuItem onSelect={onDismissNode}>Dismiss</AppDropdownMenuItem> : null}
      {showRootCreateOnly ? null : showImportIntoNodeAction ? <AppDropdownMenuItem onSelect={onImportIntoNode}>Import to this node *</AppDropdownMenuItem> : null}
      {showRootCreateOnly ? null : showPasteIntoNodeAction ? <AppDropdownMenuItem onSelect={onPasteIntoNode}>Pass to this node *</AppDropdownMenuItem> : null}
      {showRootCreateOnly ? null : showMoveToNodeAction && onMoveToNode ? <AppDropdownMenuItem onSelect={onMoveToNode}>Move to</AppDropdownMenuItem> : null}
      {showRootCreateOnly ? null : showDeleteAction ? <AppDropdownMenuItem onSelect={onDeleteNode}>Delete Node</AppDropdownMenuItem> : null}
    </>
  );
}
