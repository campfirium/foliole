import { getReviewSchedulerSettingsSignature } from '../../features/settings/model/reviewSchedulerSettings';

import { useCurrentReviewPreview } from './appControllerHelpers';
import type { useWorkspaceSelectors } from './appControllerState';
import type { BuildLayoutPropsArgs } from './layoutPropsBuilderTypes';
import { useReviewSessionSettingsReplan } from './useReviewSessionSettingsReplan';

export function useReviewSessionRuntime(args: {
  isStudyMode: boolean;
  nowIso: string;
  reviewSettings: BuildLayoutPropsArgs['reviewSettings'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  const reviewSchedulerSettingsSignature = getReviewSchedulerSettingsSignature(
    args.reviewSettings.reviewSchedulerSettings
  );
  const reviewPreview = useCurrentReviewPreview(
    args.isStudyMode,
    args.ws,
    reviewSchedulerSettingsSignature,
    args.reviewSettings.isReviewSchedulerSettingsReady
  );
  useReviewSessionSettingsReplan({
    currentNodeId: args.ws.reviewSession.currentNodeId,
    isReviewSchedulerSettingsReady: args.reviewSettings.isReviewSchedulerSettingsReady,
    nowIso: args.nowIso,
    reviewSchedulerSettingsSignature,
    reviewSessionMode: args.ws.reviewSessionMode,
    setReviewSessionMode: args.ws.setReviewSessionMode
  });
  return reviewPreview;
}
