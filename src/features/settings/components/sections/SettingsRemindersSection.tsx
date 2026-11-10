import { useEffect, useState, type FormEvent } from 'react';

import type { ReminderRule } from '../../../../../lib/core/reminders/reminderRule';
import type { DesktopReminderDraft } from '../../../../../lib/platform/nativeReminderContract';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { getDesktopReminderRepository } from '../../../../shared/platform/desktop/desktopReminderRepository';
import { AppButton, SettingsRow, SettingsSection } from '../../../../shared/ui';

const initialDraft: DesktopReminderDraft = { message: '', time: '20:00', enabled: false };
const inputClass = 'rounded-md border border-border bg-background px-2 py-1';

function useDesktopReminders() {
  const [rules, setRules] = useState<ReminderRule[] | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const load = getDesktopReminderRepository()?.load();
    if (!load) setFailed(true);
    void load?.then(
      items => { if (active) setRules(items); },
      () => { if (active) setFailed(true); }
    );
    return () => { active = false; };
  }, []);

  async function save(draft: DesktopReminderDraft) {
    setPending(true);
    setFailed(false);
    try {
      const repository = getDesktopReminderRepository();
      if (!repository) throw new Error('Desktop reminders are unavailable.');
      const saved = await repository.save(draft);
      setRules(items => [...(items ?? []).filter(rule => rule.id !== saved.id), saved]);
      return true;
    } catch {
      setFailed(true);
      return false;
    } finally {
      setPending(false);
    }
  }
  return { rules, pending, failed, save };
}

function ReminderForm({ draft, pending, onChange, onSubmit, onCancel }: {
  draft: DesktopReminderDraft;
  pending: boolean;
  onChange: (draft: DesktopReminderDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const t = useTranslation();
  return (
    <form className="space-y-2" onSubmit={onSubmit}>
      <SettingsRow title={t('settings.reminders.message')}>
        <input aria-label={t('settings.reminders.message')} className={inputClass} required
          value={draft.message} onChange={event => onChange({ ...draft, message: event.target.value })} />
      </SettingsRow>
      <SettingsRow title={t('settings.reminders.time')} description={t('settings.reminders.daily')}>
        <input aria-label={t('settings.reminders.time')} className={inputClass} required type="time"
          value={draft.time} onChange={event => onChange({ ...draft, time: event.target.value })} />
      </SettingsRow>
      <div className="flex justify-end gap-2">
        <AppButton type="button" onClick={onCancel} disabled={pending}>{t('common.cancel')}</AppButton>
        <AppButton type="submit" disabled={pending}>{t('settings.reminders.save')}</AppButton>
      </div>
    </form>
  );
}

export function SettingsRemindersSection() {
  const t = useTranslation();
  const { rules, pending, failed, save } = useDesktopReminders();
  const [draft, setDraft] = useState<DesktopReminderDraft | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft && await save(draft)) setDraft(null);
  }

  return (
    <SettingsSection title={t('settings.reminders.title')} ariaLabel={t('settings.reminders.title')}>
      {failed && <p role="alert">{t('settings.reminders.unavailable')}</p>}
      {draft ? <ReminderForm draft={draft} pending={pending} onChange={setDraft}
        onSubmit={event => void submit(event)} onCancel={() => setDraft(null)} /> : <>
        {rules?.map(rule => {
          if (rule.trigger.kind !== 'daily') return null;
          const current = { previous: { id: rule.id, revision: rule.revision }, message: rule.message,
            time: rule.trigger.time, enabled: rule.enabled };
          return (
            <SettingsRow key={rule.id} title={rule.message}
              description={t('settings.reminders.dailyAt', { time: current.time })}>
              <div className="flex items-center gap-2">
                <AppButton disabled={pending} onClick={() => setDraft(current)}>{t('settings.reminders.edit')}</AppButton>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={rule.enabled} disabled={pending}
                    aria-label={`${t('settings.reminders.enabled')} · ${rule.message}`}
                    onChange={event => void save({ ...current, enabled: event.target.checked })} />
                  {t('settings.reminders.enabled')}
                </label>
              </div>
            </SettingsRow>
          );
        })}
        <AppButton disabled={!rules || pending} onClick={() => setDraft(initialDraft)}>
          {t('settings.reminders.add')}
        </AppButton>
      </>}
    </SettingsSection>
  );
}
