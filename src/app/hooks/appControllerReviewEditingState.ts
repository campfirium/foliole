import { getReviewItemKind } from '../../features/review/model/reviewItemKind';
import type { useReviewSchedulerSettings } from '../../features/settings/context/ReviewSchedulerSettingsProvider';

import { useAppControllerReviewEditing } from './appControllerReviewEditing';
import { useReviewSourceTopicDeleteDialog } from './appControllerReviewSourceDelete';
import type { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
import type { useCommandShortcutState } from './reviewHotkeysState';
import { useResumeReviewItem } from './useResumeReviewItem';

export function useControllerReviewEditingState(args: {
  controller: ReturnType<typeof useWorkspaceControllerState>;
  hotkeys: ReturnType<typeof useCommandShortcutState>;
  isStudyMode: boolean;
  nowIso: string;
  reviewSettings: ReturnType<typeof useReviewSchedulerSettings>;
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  const isCurrentReviewItemGradable = (args.ws.reviewSession.currentNodeId ? getReviewItemKind(args.ws.nodesById[args.ws.reviewSession.currentNodeId]) : null) === 'fsrs';
  const resumeReviewItem = useResumeReviewItem(args);
  const reviewSourceTopicDeleteDialog = useReviewSourceTopicDeleteDialog(args.ws);
  const isReviewEditing = useAppControllerReviewEditing({
    controller: args.controller,
    hotkeys: args.hotkeys,
    isCurrentReviewItemGradable,
    isStudyMode: args.isStudyMode,
    resumeReviewItem,
    reviewSourceTopicDeleteDialog,
    ws: args.ws
  });
  return { isCurrentReviewItemGradable, isReviewEditing, resumeReviewItem, reviewSourceTopicDeleteDialog };
}
