import {
  ArchiveRestore,
  BookMarked,
  BookOpenCheck,
  CalendarClock,
  CircleOff,
  Clipboard,
  GitMerge,
  MoveRight,
  Pencil,
  SlidersHorizontal,
  Trash2
} from 'lucide-react';

import type { NodeListContextMenuProps } from './NodeListContextMenu';
import { NODE_LIST_CONTEXT_MENU_HELP, resolveNodeListMenuHelp } from './nodeListContextMenuHelp';
import {
  DismissMenuIcon,
  iconForCreateCommand,
  NodeContextMenuItem,
  NodeContextMenuSeparator,
  RelearnMenuIcon
} from './nodeListContextMenuPresentation';

import { useMenuHelpTooltipsEnabled } from '@/shared/platform/menuHelpTooltips';

type NoteMenuItemsProps = Omit<
  NodeListContextMenuProps,
  'isTrashMenu' | 'left' | 'onClose' | 'onDeleteNodePermanently' | 'onRestoreNode' | 'top'
>;

function TrashMenuItems({
  onDeleteNodePermanently,
  onRestoreNode
}: {
  onDeleteNodePermanently: () => void;
  onRestoreNode: () => void;
}) {
  return (
    <>
      <NodeContextMenuItem icon={ArchiveRestore} onSelect={onRestoreNode}>Restore</NodeContextMenuItem>
      <NodeContextMenuSeparator />
      <NodeContextMenuItem icon={Trash2} onSelect={onDeleteNodePermanently} tone="destructive">Delete Permanently</NodeContextMenuItem>
    </>
  );
}

function shouldShowEditGroup(props: NoteMenuItemsProps) {
  return !props.showRootCreateOnly && Boolean(
    (props.showRenameAction && props.onRenameNode) ||
    (props.showMergeHighlightsIntoTopicAction && props.onMergeHighlightsIntoTopic) ||
    (props.showPasteIntoNodeAction && props.onPasteIntoNode) ||
    (props.showMoveToNodeAction && props.onMoveToNode)
  );
}

function shouldShowReviewGroup(props: NoteMenuItemsProps) {
  return !props.showRootCreateOnly && Boolean(
    (props.showReturnAction && props.onReturnNode) ||
    (props.showReviewSchedulingAction && props.onOpenReviewScheduling) ||
    (props.showPostponeTopicAction && props.onOpenPostponeTopic) ||
    (props.showDismissAction && props.onDismissNode) ||
    (props.showShelveTopicAction && props.onShelveTopic) ||
    (props.showUnshelveTopicAction && props.onUnshelveTopic) ||
    (props.showDismissEntireTopicAction && props.onDismissEntireTopic) ||
    (props.showSequentialReadingAction && props.onToggleSequentialReading)
  );
}

function renderCreateItems(props: NoteMenuItemsProps) {
  return props.createCommands.map((command) => (
    <NodeContextMenuItem icon={iconForCreateCommand(command)} key={command.appCommandId} onSelect={() => props.onCreateCommand(command.appCommandId)}>
      {command.listLabel}
    </NodeContextMenuItem>
  ));
}

function renderEditItems(props: NoteMenuItemsProps) {
  if (props.showRootCreateOnly) return null;
  return (
    <>
      {props.showRenameAction && props.onRenameNode ? <NodeContextMenuItem icon={Pencil} onSelect={props.onRenameNode}>Rename</NodeContextMenuItem> : null}
      {props.showMergeHighlightsIntoTopicAction && props.onMergeHighlightsIntoTopic ? <NodeContextMenuItem icon={GitMerge} onSelect={props.onMergeHighlightsIntoTopic}>Merge Highlights</NodeContextMenuItem> : null}
      {props.showPasteIntoNodeAction && props.onPasteIntoNode ? <NodeContextMenuItem icon={Clipboard} onSelect={props.onPasteIntoNode}>Paste here</NodeContextMenuItem> : null}
      {props.showMoveToNodeAction && props.onMoveToNode ? <NodeContextMenuItem icon={MoveRight} onSelect={props.onMoveToNode}>Move to…</NodeContextMenuItem> : null}
    </>
  );
}

function renderReviewItems(props: NoteMenuItemsProps, helpEnabled: boolean) {
  if (props.showRootCreateOnly) return null;
  const relearnHelp = helpEnabled ? { help: resolveNodeListMenuHelp(NODE_LIST_CONTEXT_MENU_HELP.relearn) } : {};
  return (
    <>
      {props.showReturnAction && props.onReturnNode ? <NodeContextMenuItem {...relearnHelp} icon={RelearnMenuIcon} onSelect={props.onReturnNode}>Relearn</NodeContextMenuItem> : null}
      {props.showReviewSchedulingAction && props.onOpenReviewScheduling ? <NodeContextMenuItem icon={SlidersHorizontal} onSelect={props.onOpenReviewScheduling}>Review options…</NodeContextMenuItem> : null}
      {props.showPostponeTopicAction && props.onOpenPostponeTopic ? <NodeContextMenuItem icon={CalendarClock} onSelect={props.onOpenPostponeTopic}>Postpone Topic...</NodeContextMenuItem> : null}
      {props.showDismissAction && props.onDismissNode ? <NodeContextMenuItem icon={DismissMenuIcon} onSelect={props.onDismissNode}>Dismiss</NodeContextMenuItem> : null}
      {(props.showShelveTopicAction && props.onShelveTopic) || (props.showUnshelveTopicAction && props.onUnshelveTopic) || (props.showDismissEntireTopicAction && props.onDismissEntireTopic) ? <NodeContextMenuSeparator /> : null}
      {props.showShelveTopicAction && props.onShelveTopic ? <NodeContextMenuItem icon={BookMarked} onSelect={props.onShelveTopic}>Shelve entire topic</NodeContextMenuItem> : null}
      {props.showUnshelveTopicAction && props.onUnshelveTopic ? <NodeContextMenuItem icon={BookMarked} onSelect={props.onUnshelveTopic}>Unshelve</NodeContextMenuItem> : null}
      {props.showDismissEntireTopicAction && props.onDismissEntireTopic ? <NodeContextMenuItem icon={CircleOff} onSelect={props.onDismissEntireTopic}>Dismiss Entire Topic</NodeContextMenuItem> : null}
      {props.showSequentialReadingAction && props.onToggleSequentialReading ? (
        <NodeContextMenuItem icon={BookOpenCheck} onSelect={props.onToggleSequentialReading}>
          {props.sequentialReadingEnabled ? 'Disable Sequential Reading' : 'Enable Sequential Reading'}
        </NodeContextMenuItem>
      ) : null}
    </>
  );
}

function renderDeleteItem(props: NoteMenuItemsProps, hasPreviousGroup: boolean) {
  if (props.showRootCreateOnly || !props.showDeleteAction) return null;
  return (
    <>
      {hasPreviousGroup ? <NodeContextMenuSeparator /> : null}
      <NodeContextMenuItem icon={Trash2} onSelect={props.onDeleteNode} tone="destructive">Delete</NodeContextMenuItem>
    </>
  );
}

function NoteMenuItems(props: NoteMenuItemsProps) {
  const helpEnabled = useMenuHelpTooltipsEnabled();
  const hasCreateGroup = props.createCommands.length > 0;
  const hasEditGroup = shouldShowEditGroup(props);
  const hasReviewGroup = shouldShowReviewGroup(props);
  const hasAnyPrimaryGroup = hasCreateGroup || hasEditGroup || hasReviewGroup;

  return (
    <>
      {hasCreateGroup ? renderCreateItems(props) : null}
      {hasCreateGroup && hasEditGroup ? <NodeContextMenuSeparator /> : null}
      {hasEditGroup ? renderEditItems(props) : null}
      {(hasCreateGroup || hasEditGroup) && hasReviewGroup ? <NodeContextMenuSeparator /> : null}
      {hasReviewGroup ? renderReviewItems(props, helpEnabled) : null}
      {renderDeleteItem(props, hasAnyPrimaryGroup)}
    </>
  );
}

export function NodeListContextMenuItems(props: NodeListContextMenuProps) {
  if (props.isTrashMenu) {
    return <TrashMenuItems onDeleteNodePermanently={props.onDeleteNodePermanently} onRestoreNode={props.onRestoreNode} />;
  }
  return (
    <NoteMenuItems
      createCommands={props.createCommands}
      onCreateCommand={props.onCreateCommand}
      onDeleteNode={props.onDeleteNode}
      {...(props.onDismissEntireTopic ? { onDismissEntireTopic: props.onDismissEntireTopic } : {})}
      {...(props.onDismissNode ? { onDismissNode: props.onDismissNode } : {})}
      {...(props.onMergeHighlightsIntoTopic ? { onMergeHighlightsIntoTopic: props.onMergeHighlightsIntoTopic } : {})}
      {...(props.onMoveToNode ? { onMoveToNode: props.onMoveToNode } : {})}
      {...(props.onOpenReviewScheduling ? { onOpenReviewScheduling: props.onOpenReviewScheduling } : {})}
      {...(props.onOpenPostponeTopic ? { onOpenPostponeTopic: props.onOpenPostponeTopic } : {})}
      {...(props.onPasteIntoNode ? { onPasteIntoNode: props.onPasteIntoNode } : {})}
      {...(props.onRenameNode ? { onRenameNode: props.onRenameNode } : {})}
      {...(props.onReturnNode ? { onReturnNode: props.onReturnNode } : {})}
      {...(props.onShelveTopic ? { onShelveTopic: props.onShelveTopic } : {})}
      {...(props.showDeleteAction !== undefined ? { showDeleteAction: props.showDeleteAction } : {})}
      {...(props.showDismissEntireTopicAction !== undefined ? { showDismissEntireTopicAction: props.showDismissEntireTopicAction } : {})}
      {...(props.showDismissAction !== undefined ? { showDismissAction: props.showDismissAction } : {})}
      {...(props.showMergeHighlightsIntoTopicAction !== undefined ? { showMergeHighlightsIntoTopicAction: props.showMergeHighlightsIntoTopicAction } : {})}
      {...(props.showMoveToNodeAction !== undefined ? { showMoveToNodeAction: props.showMoveToNodeAction } : {})}
      {...(props.showReviewSchedulingAction !== undefined ? { showReviewSchedulingAction: props.showReviewSchedulingAction } : {})}
      {...(props.showPostponeTopicAction !== undefined ? { showPostponeTopicAction: props.showPostponeTopicAction } : {})}
      {...(props.showPasteIntoNodeAction !== undefined ? { showPasteIntoNodeAction: props.showPasteIntoNodeAction } : {})}
      {...(props.showRenameAction !== undefined ? { showRenameAction: props.showRenameAction } : {})}
      {...(props.showRootCreateOnly !== undefined ? { showRootCreateOnly: props.showRootCreateOnly } : {})}
      {...(props.showReturnAction !== undefined ? { showReturnAction: props.showReturnAction } : {})}
      {...(props.showShelveTopicAction !== undefined ? { showShelveTopicAction: props.showShelveTopicAction } : {})}
      {...(props.showSequentialReadingAction !== undefined ? { showSequentialReadingAction: props.showSequentialReadingAction } : {})}
      {...(props.showUnshelveTopicAction !== undefined ? { showUnshelveTopicAction: props.showUnshelveTopicAction } : {})}
      {...(props.onToggleSequentialReading ? { onToggleSequentialReading: props.onToggleSequentialReading } : {})}
      {...(props.onUnshelveTopic ? { onUnshelveTopic: props.onUnshelveTopic } : {})}
      {...(props.sequentialReadingEnabled !== undefined ? { sequentialReadingEnabled: props.sequentialReadingEnabled } : {})}
    />
  );
}
