import { useEffect, useState, useSyncExternalStore } from 'react';

import { useLocalization } from '../../../../shared/localization/LocalizationProvider';
import { isRuntimeInvokeAvailable } from '../../../../shared/platform/runtimeInvoke';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger, SettingsRow } from '../../../../shared/ui';
import { useWorkspaceStore } from '../../../../store/workspaceStore';
import { getReviewTrainingSession, refreshReviewTrainingStatus,
  subscribeReviewTrainingSession } from '../../../review/model/reviewTrainingSession';

export function ReviewOptimizationRow() {
  const { t, locale } = useLocalization();
  const state = useSyncExternalStore(subscribeReviewTrainingSession, getReviewTrainingSession);
  const available = isRuntimeInvokeAvailable();
  const [historyStatus, setHistoryStatus] = useState<'loading' | 'ready' | 'failed'>(available ? 'loading' : 'ready');
  const folderTitle = useWorkspaceStore(store => state.lastTrainedFolderId
    ? store.nodesById[state.lastTrainedFolderId]?.title : null);
  useEffect(() => {
    if (!available) return;
    let active = true;
    void refreshReviewTrainingStatus().then(() => {
      if (active) setHistoryStatus('ready');
    }).catch(() => { if (active) setHistoryStatus('failed'); });
    return () => { active = false; };
  }, [available]);
  const folder = state.lastTrainedFolderId === null ? t('settings.review.trainingLibrary')
    : folderTitle || t('settings.review.trainingFolderUnavailable');
  const trainedAt = available ? state.lastTrainedAt : null;
  const history = trainedAt ? <>
    <span>{folder} · </span>
    <AppTooltip>
      <AppTooltipTrigger asChild><time dateTime={trainedAt} tabIndex={0}>
        {new Date(trainedAt).toLocaleDateString(locale, { month: 'short', day: 'numeric' })}
      </time></AppTooltipTrigger>
      <AppTooltipContent layer="dropdown">{new Date(trainedAt).toLocaleString(locale, {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
      })}</AppTooltipContent>
    </AppTooltip>
  </> : t('settings.review.noTrainingHistory');
  const status = historyStatus === 'loading' ? t('settings.review.trainingHistoryLoading')
    : historyStatus === 'failed' ? t('settings.review.trainingHistoryFailed') : history;
  return <SettingsRow title={t('settings.review.optimization')}
    description={t('settings.review.optimizationDescription')}
    detail={{ label: t('settings.review.recentTraining'), value: status }} />;
}
