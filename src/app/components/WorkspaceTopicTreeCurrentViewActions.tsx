import { ChevronDown, FolderInput, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { canNodeBeMoved } from '../../features/nodes/model/nodeMovementRules';
import {
  AppButton,
  AppDialog,
  AppDialogClose,
  AppDialogContent,
  AppDialogDescription,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle,
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuLabel,
  AppDropdownMenuTrigger,
  AppIconButton
} from '../../shared/ui';
import {
  type CurrentViewTopicSnapshotNode,
  isCurrentViewTopicSnapshotStillCurrent,
  type CurrentViewTopicSnapshot
} from '../currentViewTopicSnapshot';

interface WorkspaceTopicTreeCurrentViewActionsProps {
  deleteNodes: (nodeIds: string[]) => void;
  nodesById: Record<string, CurrentViewTopicSnapshotNode | undefined>;
  onOpenMoveToNode: (sourceSnapshot?: CurrentViewTopicSnapshot[]) => void;
  topicSnapshots: CurrentViewTopicSnapshot[];
  trashedNodeIds: string[];
}

function collectStillCurrentTopicIds(args: {
  nodesById: Record<string, CurrentViewTopicSnapshotNode | undefined>;
  snapshot: CurrentViewTopicSnapshot[];
  trashedNodeIds: string[];
}) {
  const trashedNodeIdSet = new Set(args.trashedNodeIds);
  return args.snapshot
    .filter((snapshot) =>
      isCurrentViewTopicSnapshotStillCurrent(snapshot, args.nodesById[snapshot.id], trashedNodeIdSet)
    )
    .map((snapshot) => snapshot.id);
}

function formatTopicCount(count: number) {
  return `${count} ${count === 1 ? 'topic' : 'topics'}`;
}

export function WorkspaceTopicTreeCurrentViewActions({
  deleteNodes,
  nodesById,
  onOpenMoveToNode,
  topicSnapshots,
  trashedNodeIds
}: WorkspaceTopicTreeCurrentViewActionsProps) {
  const [deleteSnapshot, setDeleteSnapshot] = useState<CurrentViewTopicSnapshot[] | null>(null);
  const moveSnapshots = useMemo(
    () => topicSnapshots.filter((snapshot) => canNodeBeMoved(nodesById[snapshot.id])),
    [nodesById, topicSnapshots]
  );
  const hasTopics = topicSnapshots.length > 0;
  const hasMovableTopics = moveSnapshots.length > 0;

  return (
    <>
      <AppDropdownMenu>
        <AppDropdownMenuTrigger asChild>
          <AppIconButton
            className="size-6 text-foreground/54 hover:bg-foreground/[0.04] hover:text-foreground"
            icon={<ChevronDown size={15} strokeWidth={2} />}
            label="Current view actions"
          />
        </AppDropdownMenuTrigger>
        <AppDropdownMenuContent align="start" className="min-w-[204px]">
          <AppDropdownMenuLabel className="px-3 pb-1.5 pt-2">
            <span className="block text-xs font-medium text-foreground/72">Current view</span>
            <span className="block pt-0.5 text-xs font-normal tabular-nums text-foreground/52">
              {formatTopicCount(topicSnapshots.length)}
            </span>
          </AppDropdownMenuLabel>
          <AppDropdownMenuItem className="gap-2" disabled={!hasMovableTopics} onSelect={() => onOpenMoveToNode(moveSnapshots)}>
            <FolderInput size={15} strokeWidth={1.8} />
            <span>Move topics...</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem className="gap-2" disabled={!hasTopics} onSelect={() => setDeleteSnapshot(topicSnapshots)}>
            <Trash2 size={15} strokeWidth={1.8} />
            <span>Delete topics...</span>
          </AppDropdownMenuItem>
        </AppDropdownMenuContent>
      </AppDropdownMenu>
      <CurrentViewDeleteDialog
        deleteNodes={deleteNodes}
        deleteSnapshot={deleteSnapshot}
        nodesById={nodesById}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteSnapshot(null);
          }
        }}
        trashedNodeIds={trashedNodeIds}
      />
    </>
  );
}

function CurrentViewDeleteDialog({
  deleteNodes,
  deleteSnapshot,
  nodesById,
  onOpenChange,
  trashedNodeIds
}: {
  deleteNodes: (nodeIds: string[]) => void;
  deleteSnapshot: CurrentViewTopicSnapshot[] | null;
  nodesById: Record<string, CurrentViewTopicSnapshotNode | undefined>;
  onOpenChange: (open: boolean) => void;
  trashedNodeIds: string[];
}) {
  const topicCount = deleteSnapshot?.length ?? 0;
  return (
    <AppDialog open={Boolean(deleteSnapshot)} onOpenChange={onOpenChange}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent className="w-[min(420px,calc(100vw-32px))] p-5">
          <AppDialogTitle>Delete topics?</AppDialogTitle>
          <AppDialogDescription className="mt-2">
            {`This will move ${formatTopicCount(topicCount)} to Trash.`}
          </AppDialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <AppDialogClose asChild>
              <AppButton variant="ghost">Cancel</AppButton>
            </AppDialogClose>
            <AppButton
              variant="primary"
              onClick={() => {
                if (deleteSnapshot) {
                  deleteNodes(collectStillCurrentTopicIds({ nodesById, snapshot: deleteSnapshot, trashedNodeIds }));
                }
                onOpenChange(false);
              }}
            >
              Delete topics
            </AppButton>
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
