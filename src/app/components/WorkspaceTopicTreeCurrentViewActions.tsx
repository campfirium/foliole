import { ChevronDown, FolderInput, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { canNodeBeMoved } from '../../features/nodes/model/nodeMovementRules';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import type { TranslationKey } from '../../shared/localization/translations';
import { requestFoliolePublishedDelete } from '../../shared/platform/runtime/foliolePublishedManagement';
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

type TranslationFn = (key: TranslationKey, params?: Record<string, string | number>) => string;

function formatTopicCount(count: number, t: TranslationFn) {
  const key = count === 1 ? 'desktop.currentView.topicCount.one' : 'desktop.currentView.topicCount.many';
  return t(key, { count });
}

function requestCurrentViewDelete(
  topicSnapshots: CurrentViewTopicSnapshot[],
  onAllowed: () => void
) {
  requestFoliolePublishedDelete({
    nodeIds: topicSnapshots.map((topic) => topic.id),
    onAllowed
  });
}

export function WorkspaceTopicTreeCurrentViewActions({
  deleteNodes,
  nodesById,
  onOpenMoveToNode,
  topicSnapshots,
  trashedNodeIds
}: WorkspaceTopicTreeCurrentViewActionsProps) {
  const [deleteSnapshot, setDeleteSnapshot] = useState<CurrentViewTopicSnapshot[] | null>(null);
  const t = useTranslation();
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
            label={t('desktop.currentView.actions')}
          />
        </AppDropdownMenuTrigger>
        <AppDropdownMenuContent align="start" className="min-w-[204px]">
          <AppDropdownMenuLabel className="px-3 pb-1.5 pt-2">
            <span className="block text-xs font-medium text-foreground/72">{t('desktop.currentView.title')}</span>
            <span className="block pt-0.5 text-xs font-normal tabular-nums text-foreground/52">
              {formatTopicCount(topicSnapshots.length, t)}
            </span>
          </AppDropdownMenuLabel>
          <AppDropdownMenuItem className="gap-2" disabled={!hasMovableTopics} onSelect={() => onOpenMoveToNode(moveSnapshots)}>
            <FolderInput size={15} strokeWidth={1.8} />
            <span>{t('desktop.currentView.move')}</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            className="gap-2"
            disabled={!hasTopics}
            onSelect={() => requestCurrentViewDelete(topicSnapshots, () => setDeleteSnapshot(topicSnapshots))}
          >
            <Trash2 size={15} strokeWidth={1.8} />
            <span>{t('desktop.currentView.delete')}</span>
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
  const t = useTranslation();
  const countLabel = formatTopicCount(topicCount, t);
  return (
    <AppDialog open={Boolean(deleteSnapshot)} onOpenChange={onOpenChange}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent className="w-[min(420px,calc(100vw-32px))] p-5">
          <AppDialogTitle>{t('desktop.currentView.deleteDialog.title')}</AppDialogTitle>
          <AppDialogDescription className="mt-2">
            {t('desktop.currentView.deleteDialog.description', { countLabel })}
          </AppDialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <AppDialogClose asChild>
              <AppButton variant="ghost">{t('desktop.currentView.deleteDialog.cancel')}</AppButton>
            </AppDialogClose>
            <AppButton
              variant="danger"
              onClick={() => {
                if (deleteSnapshot) {
                  deleteNodes(collectStillCurrentTopicIds({ nodesById, snapshot: deleteSnapshot, trashedNodeIds }));
                }
                onOpenChange(false);
              }}
            >
              {t('desktop.currentView.deleteDialog.confirm')}
            </AppButton>
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
