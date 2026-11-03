import { useEffect, useState, useSyncExternalStore } from 'react';

import {
  getCurrentReviewSchedulerSettings, subscribeReviewSchedulerSettings,
  type ReviewSchedulerSettings
} from '../features/settings/model/reviewSchedulerSettings';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { loadCompanionReviewSettings, saveCompanionReviewSettings } from '../shared/platform/companion/settings/companionReviewSchedulerSettingsRepository';
import { AppButton } from '../shared/ui';

import { COMPANION_LEARNING_SETTING_FIELDS, type CompanionLearningSettingField } from './companionLearningSettingFields';

function LearningSettingRow(props: { field: CompanionLearningSettingField; settings: ReviewSchedulerSettings }) {
  const t = useTranslation();
  const current = props.field.read(props.settings);
  const [value, setValue] = useState(String(current));
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setValue(String(current)); }, [current]);
  const id = `learning-${props.field.key}`;
  return <form className="border-b border-companion-divider py-4" onSubmit={event => {
    event.preventDefault();
    if (saving || !value.trim() || !event.currentTarget.reportValidity()) return;
    setSaving(true);
    setFailed(false);
    void saveCompanionReviewSettings(props.field.patch(Number(value), getCurrentReviewSchedulerSettings()))
      .then(settings => setValue(String(props.field.read(settings))))
      .catch(() => setFailed(true)).finally(() => setSaving(false));
  }}>
    <label className="block text-sm font-medium text-foreground" htmlFor={id}>{t(props.field.label)}</label>
    <div className="mt-2 flex items-center gap-3">
      <input className="min-h-11 min-w-0 flex-1 rounded-md border border-companion-divider bg-background px-3 text-base tabular-nums text-foreground"
        disabled={saving} id={id} inputMode={props.field.step === 1 ? 'numeric' : 'decimal'} max={props.field.max} min={props.field.min}
        onChange={event => setValue(event.target.value)} required step={props.field.step} type="number" value={value} />
      <AppButton className="min-h-11" disabled={saving || (!failed && value === String(current))} type="submit">
        {t('companion.settings.learning.save')}
      </AppButton>
    </div>
    {failed ? <p className="mt-2 text-sm text-error" role="alert">{t('companion.settings.learning.saveError')}</p> : null}
  </form>;
}

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
    {COMPANION_LEARNING_SETTING_FIELDS.map(field => <LearningSettingRow field={field} key={field.key} settings={settings} />)}
  </section>;
}
