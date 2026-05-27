import type { FolderTopicItemCommandDefinition } from '../../../../lib/core/nodes/folderTopicItemCommands';
import type { VirtualNodeCommandDefinition } from '../../../../lib/core/nodes/virtualNodeCommands';

import { NodeListContextMenuItems } from './NodeListContextMenuItems';

import { AppDropdownMenu, AppDropdownMenuContent, AppDropdownMenuTrigger } from '@/shared/ui';

export interface NodeListContextMenuProps {
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
  onShelveTopic?: () => void;
  onToggleSequentialReading?: () => void;
  onUnshelveTopic?: () => void;
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
  showShelveTopicAction?: boolean;
  showSequentialReadingAction?: boolean;
  showUnshelveTopicAction?: boolean;
  sequentialReadingEnabled?: boolean;
  top: number;
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
        <NodeListContextMenuItems {...props} />
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}
