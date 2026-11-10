import { useEffect, useState, type FormEvent } from 'react';

import {
  isReminderForDevice, type ReminderDevice, type ReminderRule
} from '../../lib/core/reminders/reminderRule';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { reconcileCompanionReminders } from '../shared/platform/companionReminderNotifications';
import {
  loadCompanionReminderDevice, loadCompanionReminderRules, saveCompanionReminderRule
} from '../shared/platform/companionReminderRepository';
import { createCompanionUuid } from '../shared/platform/companionUuid';

import { CompanionSettingsDetail } from './CompanionSettingsContent';

type ReminderDraft = { id?: string; message: string; time: string; enabled: boolean };
const emptyDraft: ReminderDraft = { message: '', time: '20:00', enabled: true };

function useReminderSettings() {
  const [rules, setRules] = useState<ReminderRule[]>([]);
  const [device, setDevice] = useState<ReminderDevice>();
  const [draft, setDraft] = useState<ReminderDraft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<'failed' | 'permission' | 'saved' | 'unavailable'>();

  useEffect(() => {
    let active = true;
    void Promise.all([loadCompanionReminderRules(), loadCompanionReminderDevice()]).then(([loaded, current]) => {
      if (active) { setRules(loaded); setDevice(current); }
    }).catch(() => { if (active) setFeedback('unavailable'); });
    return () => { active = false; };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!device || busy || !draft.message.trim()) return;
    setBusy(true);
    setFeedback(undefined);
    const rule: ReminderRule = {
      id: draft.id ?? createCompanionUuid(), revision: createCompanionUuid(), message: draft.message.trim(),
      trigger: { kind: 'daily', time: draft.time }, device, enabled: draft.enabled
    };
    try {
      await saveCompanionReminderRule(rule);
      const updated = await loadCompanionReminderRules();
      setRules(updated);
      setDraft(emptyDraft);
      const result = await reconcileCompanionReminders(updated, device, rule.enabled).catch(() => 'failed' as const);
      setFeedback(result === 'permission-denied' ? 'permission' : result === 'failed' ? 'failed' : 'saved');
    } catch {
      setFeedback('unavailable');
    } finally {
      setBusy(false);
    }
  }

  return { busy, device, draft, feedback, rules, save, setDraft };
}

export function CompanionReminderSettingsContent(props: { onBack(): void }) {
  const t = useTranslation();
  const { busy, device, draft, feedback, rules, save, setDraft } = useReminderSettings();
  const localRules = device ? rules.filter(rule => isReminderForDevice(rule, device)) : [];
  return (
    <CompanionSettingsDetail onBack={props.onBack} page="reminders" title={t('settings.reminders.title')}>
      <div className="flex flex-col gap-3 px-4 py-3">
        {localRules.map(rule => <button key={rule.id} type="button" disabled={busy}
          className="text-left"
          onClick={() => setDraft({ id: rule.id, message: rule.message, time: rule.trigger.time, enabled: rule.enabled })}>
          {rule.trigger.time} · {rule.message}{rule.enabled ? '' : ` · ${t('settings.reminders.disabled')}`}
        </button>)}
        <form className="flex flex-col gap-3" onSubmit={event => void save(event)}>
          <label className="flex flex-col gap-1">
            {t('settings.reminders.message')}
            <input required value={draft.message}
              onChange={event => setDraft({ ...draft, message: event.currentTarget.value })} />
          </label>
          <label className="flex flex-col gap-1">
            {t('settings.reminders.dailyTime')}
            <input required type="time" value={draft.time}
              onChange={event => setDraft({ ...draft, time: event.currentTarget.value })} />
          </label>
          <span>{t('settings.reminders.thisDevice')}</span>
          <label className="flex gap-2">
            <input type="checkbox" checked={draft.enabled}
              onChange={event => setDraft({ ...draft, enabled: event.currentTarget.checked })} />
            {t('settings.reminders.enabled')}
          </label>
          <div className="flex gap-3">
            <button type="submit" disabled={busy || !device}>{t('settings.reminders.save')}</button>
            {draft.id && <button type="button" disabled={busy}
              onClick={() => setDraft(emptyDraft)}>{t('settings.reminders.add')}</button>}
          </div>
          {feedback && <p role="status">{t(`settings.reminders.${feedback}`)}</p>}
        </form>
      </div>
    </CompanionSettingsDetail>
  );
}
