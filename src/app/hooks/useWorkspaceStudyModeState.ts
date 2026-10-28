import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';
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

export function useWorkspaceStudyModeState(args: {
  isReviewSchedulerSettingsReady: boolean;
  nowIso: string;
  ws: WorkspaceControllerStateInput;
}) {
  const libraryScope = useWorkspaceStore(state => state.libraryScope);
  const result = useDailyFlowView({ ...args.ws, libraryScope, now: args.nowIso, includeEntries: false,
    enabled: args.ws.isHydrated && args.isReviewSchedulerSettingsReady });
  const canStartStudyMode = Boolean(result?.view?.modeAvailability.recommended);
  const study = useStudyMode({ canStartStudyMode,
    onBlockedStart: useReviewStartBlockedNotice(args.isReviewSchedulerSettingsReady) });
  return { ...study, dailyFlowView: result?.view };
}
