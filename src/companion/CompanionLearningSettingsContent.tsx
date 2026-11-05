import { useEffect, useState, useSyncExternalStore } from 'react';

import {
  getCurrentReviewSchedulerSettings, subscribeReviewSchedulerSettings
} from '../features/settings/model/reviewSchedulerSettings';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { loadCompanionReviewSettings } from '../shared/platform/companion/settings/companionReviewSchedulerSettingsRepository';
import { AppButton, SettingsSection } from '../shared/ui';

import { CompanionLearningSettingControl } from './CompanionLearningSettingControl';
import { COMPANION_LEARNING_SETTING_ROWS } from './companionLearningSettingRows';
import { CompanionReviewTrainingStatus } from './CompanionReviewTrainingStatus';

export function CompanionLearningSettingsContent() {
  const t = useTranslation();
  const settings = useSyncExternalStore(subscribeReviewSchedulerSettings, getCurrentReviewSchedulerSettings);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setStatus('loading');
    void loadCompanionReviewSettings().then(() => { if (active) setStatus('ready'); })
      .catch(() => { if (active) setStatus('failed'); });
    return () => { active = false; };
  }, [attempt]);
  if (status === 'loading') return <p role="status">{t('companion.settings.learning.loading')}</p>;
  if (status === 'failed') return <div role="alert">
    <p>{t('companion.settings.learning.loadError')}</p>
    <AppButton onClick={() => setAttempt(value => value + 1)}>{t('desktop.reviewCalendar.retry')}</AppButton>
  </div>;
  return <SettingsSection ariaLabel={t('settings.review.sectionAria')} title={t('settings.review.section')}>
    <CompanionReviewTrainingStatus />
    {COMPANION_LEARNING_SETTING_ROWS.map(row =>
      <CompanionLearningSettingControl row={row} key={row.key} settings={settings} />)}
  </SettingsSection>;
}
