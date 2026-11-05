import { useLocalization } from '../shared/localization/LocalizationProvider';
import { AppButton, SettingsRow } from '../shared/ui';

import { useCompanionReviewTrainingStatus } from './useCompanionReviewTrainingStatus';

export function CompanionReviewTrainingStatus() {
  const { t, locale } = useLocalization();
  const { phase, history, retry } = useCompanionReviewTrainingStatus();
  const folder = history?.lastTrainedFolderId === null ? t('settings.review.trainingLibrary')
    : history?.folderTitle || t('settings.review.trainingFolderUnavailable');
  const recent = history?.lastTrainedAt ? <>
    <span className="block break-words">{folder}</span>
    <time dateTime={history.lastTrainedAt}>{new Date(history.lastTrainedAt).toLocaleString(locale, {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
    })}</time>
  </> : t('settings.review.noTrainingHistory');
  const value = phase === 'loading' ? <span role="status">{t('settings.review.trainingHistoryLoading')}</span>
    : phase === 'failed' ? <div role="alert">
      <p>{t('settings.review.trainingHistoryFailed')}</p>
      <AppButton size="sm" onClick={retry}>{t('desktop.reviewCalendar.retry')}</AppButton>
    </div> : recent;
  return <SettingsRow title={t('settings.review.optimization')}
    description={t('settings.review.optimizationDescription')}
    detail={{ label: t('settings.review.recentTraining'), value }} />;
}
