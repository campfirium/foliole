import type { FolderTopicItemCommandDefinition } from '../../../../lib/core/nodes/folderTopicItemCommands';

import { NodeListContextMenuItems } from './NodeListContextMenuItems';

import { AppDropdownMenu, AppDropdownMenuContent, AppDropdownMenuTrigger } from '@/shared/ui';

export interface NodeListContextMenuProps {
  createCommands: readonly FolderTopicItemCommandDefinition[];
  isTrashMenu: boolean;
  left: number;
  onClose: () => void;
  onCreateCommand: (commandId: string) => void;
  onCreateTopicFromClipboard?: () => void;
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
  showCreateTopicFromClipboardAction?: boolean;
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
        className="min-w-[224px] p-2"
        onCloseAutoFocus={(event) => event.preventDefault()}
        onContextMenu={(event) => event.preventDefault()}
        sideOffset={0}
      >
        <NodeListContextMenuItems {...props} />
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}
