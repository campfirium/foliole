import type { FolderTopicItemCommandDefinition } from '../../../../lib/core/nodes/folderTopicItemCommands';
import type { VirtualNodeCommandDefinition } from '../../../../lib/core/nodes/virtualNodeCommands';

import { AppDropdownMenu, AppDropdownMenuContent, AppDropdownMenuItem, AppDropdownMenuTrigger } from '@/shared/ui';

interface NodeListContextMenuProps {
  createCommands: readonly (FolderTopicItemCommandDefinition | VirtualNodeCommandDefinition)[];
  isTrashMenu: boolean;
  left: number;
  onClose: () => void;
  onCreateCommand: (commandId: string) => void;
  onDeleteNode: () => void;
  onDeleteNodePermanently: () => void;
  onDismissNode?: () => void;
  onMergeHighlightsIntoTopic?: () => void;
  onMoveToNode?: () => void;
  onPasteIntoNode?: () => void;
  onRenameNode?: () => void;
  onReturnNode?: () => void;
  onRestoreNode: () => void;
  showDeleteAction?: boolean;
  showDismissAction?: boolean;
  showMergeHighlightsIntoTopicAction?: boolean;
  showMoveToNodeAction?: boolean;
  showPasteIntoNodeAction?: boolean;
  showRenameAction?: boolean;
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
      createCommands={props.createCommands}
      onCreateCommand={props.onCreateCommand}
      onDeleteNode={props.onDeleteNode}
      {...(props.onDismissNode ? { onDismissNode: props.onDismissNode } : {})}
      {...(props.onMergeHighlightsIntoTopic ? { onMergeHighlightsIntoTopic: props.onMergeHighlightsIntoTopic } : {})}
      {...(props.onMoveToNode ? { onMoveToNode: props.onMoveToNode } : {})}
      {...(props.onPasteIntoNode ? { onPasteIntoNode: props.onPasteIntoNode } : {})}
      {...(props.onRenameNode ? { onRenameNode: props.onRenameNode } : {})}
      {...(props.onReturnNode ? { onReturnNode: props.onReturnNode } : {})}
      {...(props.showDeleteAction !== undefined ? { showDeleteAction: props.showDeleteAction } : {})}
      {...(props.showDismissAction !== undefined ? { showDismissAction: props.showDismissAction } : {})}
      {...(props.showMergeHighlightsIntoTopicAction !== undefined ? { showMergeHighlightsIntoTopicAction: props.showMergeHighlightsIntoTopicAction } : {})}
      {...(props.showMoveToNodeAction !== undefined ? { showMoveToNodeAction: props.showMoveToNodeAction } : {})}
      {...(props.showPasteIntoNodeAction !== undefined ? { showPasteIntoNodeAction: props.showPasteIntoNodeAction } : {})}
      {...(props.showRenameAction !== undefined ? { showRenameAction: props.showRenameAction } : {})}
      {...(props.showRootCreateOnly !== undefined ? { showRootCreateOnly: props.showRootCreateOnly } : {})}
      {...(props.showReturnAction !== undefined ? { showReturnAction: props.showReturnAction } : {})}
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
  createCommands,
  onCreateCommand,
  onDeleteNode,
  onDismissNode,
  onMergeHighlightsIntoTopic,
  onMoveToNode,
  onPasteIntoNode,
  onRenameNode,
  onReturnNode,
  showDeleteAction,
  showDismissAction,
  showMergeHighlightsIntoTopicAction,
  showMoveToNodeAction,
  showPasteIntoNodeAction,
  showRenameAction,
  showRootCreateOnly,
  showReturnAction
}: Omit<NodeListContextMenuProps, 'isTrashMenu' | 'left' | 'onClose' | 'onDeleteNodePermanently' | 'onRestoreNode' | 'top'>) {
  return (
    <>
      {createCommands.map((command) => (
        <AppDropdownMenuItem key={command.appCommandId} onSelect={() => onCreateCommand(command.appCommandId)}>
          {command.listLabel}
        </AppDropdownMenuItem>
      ))}
      {showRootCreateOnly ? null : showRenameAction && onRenameNode ? <AppDropdownMenuItem onSelect={onRenameNode}>Rename</AppDropdownMenuItem> : null}
      {showRootCreateOnly ? null : showReturnAction && onReturnNode ? <AppDropdownMenuItem onSelect={onReturnNode}>Relearn</AppDropdownMenuItem> : null}
      {showRootCreateOnly ? null : showDismissAction && onDismissNode ? <AppDropdownMenuItem onSelect={onDismissNode}>Dismiss</AppDropdownMenuItem> : null}
      {showRootCreateOnly ? null : showMergeHighlightsIntoTopicAction && onMergeHighlightsIntoTopic ? <AppDropdownMenuItem onSelect={onMergeHighlightsIntoTopic}>Merge Highlights</AppDropdownMenuItem> : null}
      {showRootCreateOnly ? null : showPasteIntoNodeAction && onPasteIntoNode ? <AppDropdownMenuItem onSelect={onPasteIntoNode}>Paste here</AppDropdownMenuItem> : null}
      {showRootCreateOnly ? null : showMoveToNodeAction && onMoveToNode ? <AppDropdownMenuItem onSelect={onMoveToNode}>Move to…</AppDropdownMenuItem> : null}
      {showRootCreateOnly ? null : showDeleteAction ? <AppDropdownMenuItem onSelect={onDeleteNode}>Delete</AppDropdownMenuItem> : null}
    </>
  );
}
