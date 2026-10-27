import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { hasDailyFlowRuntime } from '../../shared/platform/runtime/dailyFlowRuntimeRepository';
import { useDemoRuntimeState } from '../../shared/platform/runtime/demoRuntime';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';
import { buildStartReviewSessionQueue } from '../../store/workspaceReviewLiveQueue';
import { useWorkspaceStore } from '../../store/workspaceStore';

import type { useWorkspaceSelectors } from './appWorkspaceSelectors';
import { useDailyFlowView } from './useDailyFlowView';
import { useStudyMode } from './useStudyMode';

type WorkspaceControllerStateInput = ReturnType<typeof useWorkspaceSelectors>;

function useReviewStartBlockedNotice(isReviewSchedulerSettingsReady: boolean) {
  const t = useTranslation();
  if (!isReviewSchedulerSettingsReady) {
    return undefined;
  }
  return () => showAppRuntimeNotice(t('desktop.reviewSession.allClear.notice'), 'success');
}

function resolveCanStartStudyMode(args: {
  isDemo: boolean;
  isReviewSchedulerSettingsReady: boolean;
  nowIso: string;
  ws: WorkspaceControllerStateInput;
}) {
  return args.isReviewSchedulerSettingsReady && buildStartReviewSessionQueue(args.ws, args.nowIso, {
    includeScheduledFallback: args.isDemo
  }).length > 0;
}

export function useWorkspaceStudyModeState(args: {
  isReviewSchedulerSettingsReady: boolean;
  nowIso: string;
  ws: WorkspaceControllerStateInput;
}) {
  const demoRuntime = useDemoRuntimeState();
  const libraryScope = useWorkspaceStore(state => state.libraryScope);
  const result = useDailyFlowView({ ...args.ws, libraryScope, now: args.nowIso, includeEntries: false,
    enabled: args.ws.isHydrated && args.isReviewSchedulerSettingsReady });
  const canStartStudyMode = hasDailyFlowRuntime()
    ? Boolean(result?.view?.modeAvailability.recommended)
    : resolveCanStartStudyMode({
      isDemo: demoRuntime.isDemo,
      isReviewSchedulerSettingsReady: args.isReviewSchedulerSettingsReady,
      nowIso: args.nowIso,
      ws: args.ws
    });
  const study = useStudyMode({ canStartStudyMode,
    onBlockedStart: useReviewStartBlockedNotice(args.isReviewSchedulerSettingsReady) });
  return { ...study, dailyFlowView: result?.view };
}

