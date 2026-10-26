import { useEffect, useState, useSyncExternalStore } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { isRuntimeInvokeAvailable } from '../../../../shared/platform/runtimeInvoke';
import { SettingsRow } from '../../../../shared/ui';
import { useWorkspaceStore } from '../../../../store/workspaceStore';
import { getReviewTrainingSession, refreshReviewTrainingStatus,
  subscribeReviewTrainingSession } from '../../../review/model/reviewTrainingSession';

export function ReviewOptimizationRow() {
  const t = useTranslation();
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
  const history = !available || !state.lastTrainedAt ? t('settings.review.noTrainingHistory')
    : t('settings.review.recentTraining', { folder, time: new Date(state.lastTrainedAt).toLocaleString() });
  const status = historyStatus === 'loading' ? t('settings.review.trainingHistoryLoading')
    : historyStatus === 'failed' ? t('settings.review.trainingHistoryFailed') : history;
  return <SettingsRow title={t('settings.review.optimization')} description={<>
    <span className="block">{t('settings.review.optimizationDescription')}</span>
    <span className="block">{status}</span>
  </>} />;
}
