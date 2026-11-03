import { useEffect, useState, useSyncExternalStore } from 'react';

import {
  getCurrentReviewSchedulerSettings, subscribeReviewSchedulerSettings
} from '../features/settings/model/reviewSchedulerSettings';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { loadCompanionReviewSettings } from '../shared/platform/companion/settings/companionReviewSchedulerSettingsRepository';
import { AppButton } from '../shared/ui';

import { CompanionLearningSettingControl } from './CompanionLearningSettingControl';
import { COMPANION_LEARNING_SETTING_FIELDS, COMPANION_LEARNING_SETTING_GROUPS } from './companionLearningSettingFields';

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
  return <section aria-label={t('companion.settings.learning.title')}>
    {COMPANION_LEARNING_SETTING_GROUPS.map(group => <fieldset className="mt-5 first:mt-0" key={group.title}>
      <legend className="pb-1 text-xs text-companion-text-tertiary">{t(group.title)}</legend>
      {COMPANION_LEARNING_SETTING_FIELDS.filter(field => group.keys.includes(field.key)).map(field =>
        <CompanionLearningSettingControl field={field} key={field.key} settings={settings} />)}
    </fieldset>)}
  </section>;
}
