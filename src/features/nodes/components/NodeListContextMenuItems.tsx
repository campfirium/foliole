import {
  ArchiveRestore,
  BookMarked,
  BookOpenCheck,
  CalendarClock,
  CircleOff,
  Clipboard,
  GitMerge,
  ListPlus,
  ListMinus,
  MoveRight,
  SlidersHorizontal,
  Trash2
} from 'lucide-react';

import { FOLDER_TOPIC_ITEM_APP_COMMAND_IDS } from '../../../../lib/core/nodes/folderTopicItemCommands';
import { useTranslation, type Translate } from '../../../shared/localization/LocalizationProvider';

import { NODE_LIST_CONTEXT_ACTION_HELP, resolveNodeListActionHelp } from './nodeListContextActionHelp';
import type { NodeListContextMenuProps } from './NodeListContextMenu';
import {
  DismissMenuIcon,
  iconForCreateCommand,
  NodeContextMenuItem,
  NodeContextMenuSeparator,
  RelearnMenuIcon
} from './nodeListContextMenuPresentation';
import { NodeRenameContextMenuItem } from './NodeRenameContextMenuItem';

import { useActionHelpCardsEnabled } from '@/shared/platform/actionHelpCards';

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
  const t = useTranslation();
  return (
    <>
      <NodeContextMenuItem icon={ArchiveRestore} onSelect={onRestoreNode}>{t('desktop.nodeList.menu.restore')}</NodeContextMenuItem>
      <NodeContextMenuSeparator />
      <NodeContextMenuItem icon={Trash2} onSelect={onDeleteNodePermanently} tone="destructive">{t('desktop.nodeList.menu.deletePermanently')}</NodeContextMenuItem>
    </>
  );
}

function shouldShowEditGroup(props: NoteMenuItemsProps) {
  return Boolean(
    (props.showRenameAction && props.onRenameNode) ||
    (!props.showRootCreateOnly && (
    (props.showMergeHighlightsIntoTopicAction && props.onMergeHighlightsIntoTopic) ||
    (props.showPasteIntoNodeAction && props.onPasteIntoNode) ||
    (props.showAddToVirtualFolderAction && props.onAddToVirtualFolder) ||
    (props.showMoveToNodeAction && props.onMoveToNode)
    ))
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

function createCommandLabel(t: Translate, command: NoteMenuItemsProps['createCommands'][number]) {
  if (command.appCommandId === FOLDER_TOPIC_ITEM_APP_COMMAND_IDS.createFolder) return t('desktop.nodeList.createFolder');
  if (command.appCommandId === FOLDER_TOPIC_ITEM_APP_COMMAND_IDS.createTopic) return t('desktop.nodeList.createTopic');
  if (command.appCommandId === FOLDER_TOPIC_ITEM_APP_COMMAND_IDS.createItem) return t('desktop.nodeList.createItem');
  return command.listLabel;
}

function renderCreateItems(t: Translate, props: NoteMenuItemsProps, helpEnabled: boolean) {
  const clipboardHelp = helpEnabled ? { help: resolveNodeListActionHelp(NODE_LIST_CONTEXT_ACTION_HELP.pasteClipboardTopic) } : {};
  return (
    <>
      {props.createCommands.map((command) => (
        <NodeContextMenuItem icon={iconForCreateCommand(command)} key={command.appCommandId} onSelect={() => props.onCreateCommand(command.appCommandId)}>
          {createCommandLabel(t, command)}
        </NodeContextMenuItem>
      ))}
      {props.showCreateTopicFromClipboardAction && props.onCreateTopicFromClipboard ? (
        <NodeContextMenuItem {...clipboardHelp} icon={Clipboard} onSelect={props.onCreateTopicFromClipboard}>{t('desktop.nodeList.menu.pasteAsTopic')}</NodeContextMenuItem>
      ) : null}
    </>
  );
}

function renderEditItems(t: Translate, props: NoteMenuItemsProps, helpEnabled: boolean) {
  const helpProps = (copy: (typeof NODE_LIST_CONTEXT_ACTION_HELP)[keyof typeof NODE_LIST_CONTEXT_ACTION_HELP]) =>
    helpEnabled ? { help: resolveNodeListActionHelp(copy) } : {};
  return (
    <>
      {props.showRenameAction && props.onRenameNode ? <NodeRenameContextMenuItem onSelect={props.onRenameNode} /> : null}
      {!props.showRootCreateOnly && props.showMergeHighlightsIntoTopicAction && props.onMergeHighlightsIntoTopic ? <NodeContextMenuItem {...helpProps(NODE_LIST_CONTEXT_ACTION_HELP.mergeHighlights)} icon={GitMerge} onSelect={props.onMergeHighlightsIntoTopic}>{t('desktop.nodeList.menu.mergeHighlights')}</NodeContextMenuItem> : null}
      {!props.showRootCreateOnly && props.showPasteIntoNodeAction && props.onPasteIntoNode ? <NodeContextMenuItem {...helpProps(NODE_LIST_CONTEXT_ACTION_HELP.pasteClipboardTopic)} icon={Clipboard} onSelect={props.onPasteIntoNode}>{t('desktop.nodeList.menu.pasteAsTopic')}</NodeContextMenuItem> : null}
      {!props.showRootCreateOnly && props.showMoveToNodeAction && props.onMoveToNode ? <NodeContextMenuItem icon={MoveRight} onSelect={props.onMoveToNode}>{t('desktop.nodeList.menu.moveTo')}</NodeContextMenuItem> : null}
      {!props.showRootCreateOnly && props.showAddToVirtualFolderAction && props.onAddToVirtualFolder ? <NodeContextMenuItem icon={ListPlus} onSelect={props.onAddToVirtualFolder}>{t('desktop.nodeList.menu.addToVirtualFolder')}</NodeContextMenuItem> : null}
    </>
  );
}

function renderReviewItems(t: Translate, props: NoteMenuItemsProps, helpEnabled: boolean) {
  if (props.showRootCreateOnly) return null;
  const help = helpEnabled ? NODE_LIST_CONTEXT_ACTION_HELP : null;
  const helpProps = (copy: (typeof NODE_LIST_CONTEXT_ACTION_HELP)[keyof typeof NODE_LIST_CONTEXT_ACTION_HELP]) =>
    help ? { help: resolveNodeListActionHelp(copy) } : {};
  return (
    <>
      {props.showReturnAction && props.onReturnNode ? <NodeContextMenuItem {...helpProps(NODE_LIST_CONTEXT_ACTION_HELP.relearn)} icon={RelearnMenuIcon} onSelect={props.onReturnNode}>{t('desktop.nodeList.menu.relearn')}</NodeContextMenuItem> : null}
      {props.showReviewSchedulingAction && props.onOpenReviewScheduling ? <NodeContextMenuItem icon={SlidersHorizontal} onSelect={props.onOpenReviewScheduling}>{t('desktop.nodeList.menu.reviewOptions')}</NodeContextMenuItem> : null}
      {props.showPostponeTopicAction && props.onOpenPostponeTopic ? <NodeContextMenuItem {...helpProps(NODE_LIST_CONTEXT_ACTION_HELP.postponeTopic)} icon={CalendarClock} onSelect={props.onOpenPostponeTopic}>{t('desktop.nodeList.menu.postponeTopic')}</NodeContextMenuItem> : null}
      {props.showDismissAction && props.onDismissNode ? <NodeContextMenuItem {...helpProps(NODE_LIST_CONTEXT_ACTION_HELP.dismiss)} icon={DismissMenuIcon} onSelect={props.onDismissNode}>{t('desktop.nodeList.menu.dismiss')}</NodeContextMenuItem> : null}
      {(props.showShelveTopicAction && props.onShelveTopic) || (props.showUnshelveTopicAction && props.onUnshelveTopic) || (props.showDismissEntireTopicAction && props.onDismissEntireTopic) ? <NodeContextMenuSeparator /> : null}
      {props.showShelveTopicAction && props.onShelveTopic ? <NodeContextMenuItem {...helpProps(NODE_LIST_CONTEXT_ACTION_HELP.shelveTopic)} icon={BookMarked} onSelect={props.onShelveTopic}>{t('desktop.nodeList.menu.shelveTopic')}</NodeContextMenuItem> : null}
      {props.showUnshelveTopicAction && props.onUnshelveTopic ? <NodeContextMenuItem {...helpProps(NODE_LIST_CONTEXT_ACTION_HELP.unshelveTopic)} icon={BookMarked} onSelect={props.onUnshelveTopic}>{t('desktop.nodeList.menu.unshelveTopic')}</NodeContextMenuItem> : null}
      {props.showDismissEntireTopicAction && props.onDismissEntireTopic ? <NodeContextMenuItem {...helpProps(NODE_LIST_CONTEXT_ACTION_HELP.dismissTopic)} icon={CircleOff} onSelect={props.onDismissEntireTopic}>{t('desktop.nodeList.menu.dismissTopic')}</NodeContextMenuItem> : null}
      {props.showSequentialReadingAction && props.onToggleSequentialReading ? (
        <NodeContextMenuItem
          {...helpProps(props.sequentialReadingEnabled ? NODE_LIST_CONTEXT_ACTION_HELP.sequentialReadingDisable : NODE_LIST_CONTEXT_ACTION_HELP.sequentialReadingEnable)}
          icon={BookOpenCheck}
          onSelect={props.onToggleSequentialReading}
        >
          {props.sequentialReadingEnabled ? t('desktop.nodeList.menu.disableSequentialReading') : t('desktop.nodeList.menu.enableSequentialReading')}
        </NodeContextMenuItem>
      ) : null}
    </>
  );
}

function renderRemovalItems(t: Translate, props: NoteMenuItemsProps, hasPreviousGroup: boolean) {
  const removeFromCurrentVirtualFolder = props.showRemoveFromCurrentVirtualFolderAction
    ? props.onRemoveFromCurrentVirtualFolder
    : undefined;
  if (props.showRootCreateOnly || (!removeFromCurrentVirtualFolder && !props.showDeleteAction)) return null;
  return (
    <>
      {hasPreviousGroup ? <NodeContextMenuSeparator /> : null}
      {removeFromCurrentVirtualFolder ? <NodeContextMenuItem icon={ListMinus} onSelect={removeFromCurrentVirtualFolder}>{t('desktop.nodeList.menu.removeFromCurrentVirtualFolder')}</NodeContextMenuItem> : null}
      {removeFromCurrentVirtualFolder && props.showDeleteAction ? <NodeContextMenuSeparator /> : null}
      {props.showDeleteAction ? <NodeContextMenuItem icon={Trash2} onSelect={props.onDeleteNode} tone="destructive">{t('desktop.nodeList.menu.delete')}</NodeContextMenuItem> : null}
    </>
  );
}

function NoteMenuItems(props: NoteMenuItemsProps) {
  const t = useTranslation();
  const helpEnabled = useActionHelpCardsEnabled();
  const hasCreateGroup = props.createCommands.length > 0 || Boolean(props.showCreateTopicFromClipboardAction && props.onCreateTopicFromClipboard);
  const hasEditGroup = shouldShowEditGroup(props);
  const hasReviewGroup = shouldShowReviewGroup(props);
  const hasAnyPrimaryGroup = hasCreateGroup || hasEditGroup || hasReviewGroup;

  return (
    <>
      {hasCreateGroup ? renderCreateItems(t, props, helpEnabled) : null}
      {hasCreateGroup && hasEditGroup ? <NodeContextMenuSeparator /> : null}
      {hasEditGroup ? renderEditItems(t, props, helpEnabled) : null}
      {(hasCreateGroup || hasEditGroup) && hasReviewGroup ? <NodeContextMenuSeparator /> : null}
      {hasReviewGroup ? renderReviewItems(t, props, helpEnabled) : null}
      {renderRemovalItems(t, props, hasAnyPrimaryGroup)}
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
      {...(props.onAddToVirtualFolder ? { onAddToVirtualFolder: props.onAddToVirtualFolder } : {})}
      {...(props.onCreateTopicFromClipboard ? { onCreateTopicFromClipboard: props.onCreateTopicFromClipboard } : {})}
      onCreateCommand={props.onCreateCommand}
      onDeleteNode={props.onDeleteNode}
      {...(props.onDismissEntireTopic ? { onDismissEntireTopic: props.onDismissEntireTopic } : {})}
      {...(props.onDismissNode ? { onDismissNode: props.onDismissNode } : {})}
      {...(props.onMergeHighlightsIntoTopic ? { onMergeHighlightsIntoTopic: props.onMergeHighlightsIntoTopic } : {})}
      {...(props.onMoveToNode ? { onMoveToNode: props.onMoveToNode } : {})}
      {...(props.onOpenReviewScheduling ? { onOpenReviewScheduling: props.onOpenReviewScheduling } : {})}
      {...(props.onOpenPostponeTopic ? { onOpenPostponeTopic: props.onOpenPostponeTopic } : {})}
      {...(props.onPasteIntoNode ? { onPasteIntoNode: props.onPasteIntoNode } : {})}
      {...(props.onRemoveFromCurrentVirtualFolder ? { onRemoveFromCurrentVirtualFolder: props.onRemoveFromCurrentVirtualFolder } : {})}
      {...(props.onRenameNode ? { onRenameNode: props.onRenameNode } : {})}
      {...(props.onReturnNode ? { onReturnNode: props.onReturnNode } : {})}
      {...(props.onShelveTopic ? { onShelveTopic: props.onShelveTopic } : {})}
      {...(props.showDeleteAction !== undefined ? { showDeleteAction: props.showDeleteAction } : {})}
      {...(props.showAddToVirtualFolderAction !== undefined ? { showAddToVirtualFolderAction: props.showAddToVirtualFolderAction } : {})}
      {...(props.showCreateTopicFromClipboardAction !== undefined ? { showCreateTopicFromClipboardAction: props.showCreateTopicFromClipboardAction } : {})}
      {...(props.showDismissEntireTopicAction !== undefined ? { showDismissEntireTopicAction: props.showDismissEntireTopicAction } : {})}
      {...(props.showDismissAction !== undefined ? { showDismissAction: props.showDismissAction } : {})}
      {...(props.showMergeHighlightsIntoTopicAction !== undefined ? { showMergeHighlightsIntoTopicAction: props.showMergeHighlightsIntoTopicAction } : {})}
      {...(props.showMoveToNodeAction !== undefined ? { showMoveToNodeAction: props.showMoveToNodeAction } : {})}
      {...(props.showReviewSchedulingAction !== undefined ? { showReviewSchedulingAction: props.showReviewSchedulingAction } : {})}
      {...(props.showPostponeTopicAction !== undefined ? { showPostponeTopicAction: props.showPostponeTopicAction } : {})}
      {...(props.showPasteIntoNodeAction !== undefined ? { showPasteIntoNodeAction: props.showPasteIntoNodeAction } : {})}
      {...(props.showRemoveFromCurrentVirtualFolderAction !== undefined ? { showRemoveFromCurrentVirtualFolderAction: props.showRemoveFromCurrentVirtualFolderAction } : {})}
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
