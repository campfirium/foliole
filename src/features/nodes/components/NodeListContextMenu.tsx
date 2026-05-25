import {
  ArchiveRestore,
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

import type { FolderTopicItemCommandDefinition } from '../../../../lib/core/nodes/folderTopicItemCommands';
import type { VirtualNodeCommandDefinition } from '../../../../lib/core/nodes/virtualNodeCommands';

import {
  DismissMenuIcon,
  iconForCreateCommand,
  NodeContextMenuItem,
  NodeContextMenuSeparator,
  RelearnMenuIcon
} from './nodeListContextMenuPresentation';

import { AppDropdownMenu, AppDropdownMenuContent, AppDropdownMenuTrigger } from '@/shared/ui';

interface NodeListContextMenuProps {
  createCommands: readonly (FolderTopicItemCommandDefinition | VirtualNodeCommandDefinition)[];
  isTrashMenu: boolean;
  left: number;
  onClose: () => void;
  onCreateCommand: (commandId: string) => void;
  onDeleteNode: () => void;
  onDeleteNodePermanently: () => void;
  onDismissEntireTopic?: () => void;
  onDismissNode?: () => void;
  onMergeHighlightsIntoTopic?: () => void;
  onMoveToNode?: () => void;
  onOpenReviewScheduling?: () => void;
  onOpenPostponeTopic?: () => void;
  onPasteIntoNode?: () => void;
  onRenameNode?: () => void;
  onReturnNode?: () => void;
  onRestoreNode: () => void;
  onToggleSequentialReading?: () => void;
  showDeleteAction?: boolean;
  showDismissEntireTopicAction?: boolean;
  showDismissAction?: boolean;
  showMergeHighlightsIntoTopicAction?: boolean;
  showMoveToNodeAction?: boolean;
  showReviewSchedulingAction?: boolean;
  showPostponeTopicAction?: boolean;
  showPasteIntoNodeAction?: boolean;
  showRenameAction?: boolean;
  showRootCreateOnly?: boolean;
  showReturnAction?: boolean;
  showSequentialReadingAction?: boolean;
  sequentialReadingEnabled?: boolean;
  top: number;
}

type NoteMenuItemsProps = Omit<
  NodeListContextMenuProps,
  'isTrashMenu' | 'left' | 'onClose' | 'onDeleteNodePermanently' | 'onRestoreNode' | 'top'
>;

function renderMenuItems(props: NodeListContextMenuProps) {
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
      {...(props.showSequentialReadingAction !== undefined ? { showSequentialReadingAction: props.showSequentialReadingAction } : {})}
      {...(props.onToggleSequentialReading ? { onToggleSequentialReading: props.onToggleSequentialReading } : {})}
      {...(props.sequentialReadingEnabled !== undefined ? { sequentialReadingEnabled: props.sequentialReadingEnabled } : {})}
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
        className={[
          'min-w-[224px] rounded-lg border-[var(--app-floating-border-color)] p-2 shadow-popover',
          'bg-[color-mix(in_oklab,var(--app-floating-surface-bg)_82%,rgb(var(--color-background)))]',
          '[--node-context-menu-item-hover-bg:color-mix(in_oklab,var(--app-floating-item-hover-bg)_52%,rgb(var(--color-foreground)/0.12))]'
        ].join(' ')}
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
      <NodeContextMenuItem icon={ArchiveRestore} onSelect={onRestoreNode}>Restore</NodeContextMenuItem>
      <NodeContextMenuSeparator />
      <NodeContextMenuItem icon={Trash2} onSelect={onDeleteNodePermanently} tone="destructive">Delete Permanently</NodeContextMenuItem>
    </>
  );
}

function shouldShowEditGroup(props: NoteMenuItemsProps) {
  return !props.showRootCreateOnly && (
    (props.showRenameAction && props.onRenameNode) ||
    (props.showMergeHighlightsIntoTopicAction && props.onMergeHighlightsIntoTopic) ||
    (props.showPasteIntoNodeAction && props.onPasteIntoNode) ||
    (props.showMoveToNodeAction && props.onMoveToNode)
  );
}

function shouldShowReviewGroup(props: NoteMenuItemsProps) {
  return !props.showRootCreateOnly && (
    (props.showReturnAction && props.onReturnNode) ||
    (props.showReviewSchedulingAction && props.onOpenReviewScheduling) ||
    (props.showPostponeTopicAction && props.onOpenPostponeTopic) ||
    (props.showDismissAction && props.onDismissNode) ||
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

function renderReviewItems(props: NoteMenuItemsProps) {
  if (props.showRootCreateOnly) return null;
  return (
    <>
      {props.showReturnAction && props.onReturnNode ? <NodeContextMenuItem icon={RelearnMenuIcon} onSelect={props.onReturnNode}>Relearn</NodeContextMenuItem> : null}
      {props.showReviewSchedulingAction && props.onOpenReviewScheduling ? <NodeContextMenuItem icon={SlidersHorizontal} onSelect={props.onOpenReviewScheduling}>Review options…</NodeContextMenuItem> : null}
      {props.showPostponeTopicAction && props.onOpenPostponeTopic ? <NodeContextMenuItem icon={CalendarClock} onSelect={props.onOpenPostponeTopic}>Postpone Topic...</NodeContextMenuItem> : null}
      {props.showDismissAction && props.onDismissNode ? <NodeContextMenuItem icon={DismissMenuIcon} onSelect={props.onDismissNode}>Dismiss</NodeContextMenuItem> : null}
      {props.showDismissEntireTopicAction && props.onDismissEntireTopic ? <NodeContextMenuItem icon={CircleOff} onSelect={props.onDismissEntireTopic}>Dismiss Entire Topic</NodeContextMenuItem> : null}
      {props.showSequentialReadingAction && props.onToggleSequentialReading ? (
        <NodeContextMenuItem icon={BookOpenCheck} onSelect={props.onToggleSequentialReading}>
          {props.sequentialReadingEnabled ? 'Disable Sequential Reading' : 'Enable Sequential Reading'}
        </NodeContextMenuItem>
      ) : null}
    </>
  );
}

function renderDeleteItem(props: NoteMenuItemsProps) {
  if (props.showRootCreateOnly || !props.showDeleteAction) return null;
  return (
    <>
      <NodeContextMenuSeparator />
      <NodeContextMenuItem icon={Trash2} onSelect={props.onDeleteNode} tone="destructive">Delete</NodeContextMenuItem>
    </>
  );
}

function NoteMenuItems(props: NoteMenuItemsProps) {
  return (
    <>
      {renderCreateItems(props)}
      {shouldShowEditGroup(props) ? <NodeContextMenuSeparator /> : null}
      {renderEditItems(props)}
      {shouldShowReviewGroup(props) ? <NodeContextMenuSeparator /> : null}
      {renderReviewItems(props)}
      {renderDeleteItem(props)}
    </>
  );
}
