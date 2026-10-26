import { useEffect, useSyncExternalStore } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { isRuntimeInvokeAvailable } from '../../../../shared/platform/runtimeInvoke';
import { SettingsButton, SettingsRow } from '../../../../shared/ui';
import { getReviewTrainingSession, optimizeReadyReviewFolders, refreshReviewTrainingStatus,
  subscribeReviewTrainingSession } from '../../../review/model/reviewTrainingSession';

export function ReviewOptimizationRow() {
  const t = useTranslation();
  const state = useSyncExternalStore(subscribeReviewTrainingSession, getReviewTrainingSession);
  const available = isRuntimeInvokeAvailable();
  useEffect(() => {
    if (available) void refreshReviewTrainingStatus().catch(() => undefined);
  }, [available]);
  if (!available) return null;
  const description = state.error ? t('settings.review.optimizationFailed') : state.lastTrainedAt
    ? t('settings.review.lastOptimization', { time: new Date(state.lastTrainedAt).toLocaleString() })
    : t('settings.review.optimizationDescription');
  return <SettingsRow title={t('settings.review.optimization')} description={description}>
    <SettingsButton disabled={state.studyActive} loading={state.running}
      loadingLabel={t('settings.review.optimizing')}
      onClick={() => { void optimizeReadyReviewFolders().catch(() => undefined); }}>
      {t('settings.review.optimizeNow')}
    </SettingsButton>
  </SettingsRow>;
}
