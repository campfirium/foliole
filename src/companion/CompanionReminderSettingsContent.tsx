import { Bell, Plus } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

import {
  isReminderForDevice, type ReminderDevice, type ReminderRule
} from '../../lib/core/reminders/reminderRule';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { reconcileCompanionReminders } from '../shared/platform/companion/settings/companionReminderNotifications';
import {
  loadCompanionReminderDevice, loadCompanionReminderRules, saveCompanionReminderRule
} from '../shared/platform/companion/settings/companionReminderRepository';
import { createCompanionUuid } from '../shared/platform/companionUuid';
import { AppButton } from '../shared/ui';

import { CompanionListRow, CompanionListSection } from './CompanionListSurface';
import { CompanionReminderEditor, type ReminderDraft } from './CompanionReminderEditor';
import { CompanionSettingsDetail } from './CompanionSettingsContent';

const emptyDraft: ReminderDraft = { message: '', time: '20:00', enabled: true };

function useReminderSettings() {
  const [rules, setRules] = useState<ReminderRule[]>([]);
  const [device, setDevice] = useState<ReminderDevice>();
  const [draft, setDraft] = useState<ReminderDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<'failed' | 'permission' | 'exactPermission' | 'saved' | 'unavailable'>();

  useEffect(() => {
    let active = true;
    void Promise.all([loadCompanionReminderRules(), loadCompanionReminderDevice()]).then(([loaded, current]) => {
      if (active) { setRules(loaded); setDevice(current); }
    }).catch(() => { if (active) setFeedback('unavailable'); });
    return () => { active = false; };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!device || busy || !draft?.message.trim()) return;
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
      setDraft(null);
      const result = await reconcileCompanionReminders(updated, device, rule.enabled).catch(() => 'failed' as const);
      if (result === 'permission-denied') setFeedback('permission');
      else if (result === 'exact-permission-denied') setFeedback('exactPermission');
      else setFeedback(result === 'failed' ? 'failed' : 'saved');
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
  const edit = (rule: ReminderRule) => setDraft({
    id: rule.id, message: rule.message, time: rule.trigger.time, enabled: rule.enabled
  });
  const status = feedback && <p role="status" className="text-sm leading-5 text-companion-text-secondary">
    {t(`settings.reminders.${feedback}`)}
  </p>;
  return (
    <CompanionSettingsDetail onBack={props.onBack} page="reminders" title={t('settings.reminders.title')}>
      <div className="space-y-5 py-4">
        {draft ? <CompanionReminderEditor busy={busy} draft={draft} onChange={setDraft}
          onCancel={() => setDraft(null)} onSave={save} /> : <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-companion-text-secondary">{t('settings.reminders.thisDevice')}</p>
            <AppButton className="min-h-11" disabled={busy || !device} onClick={() => setDraft(emptyDraft)}>
              <Plus size={16} aria-hidden="true" />{t('settings.reminders.add')}
            </AppButton>
          </div>
          {device && (localRules.length ? <CompanionListSection isFirst>
            {localRules.map(rule => {
              const off = rule.enabled ? '' : ` · ${t('settings.reminders.disabled')}`;
              return <CompanionListRow key={rule.id} Icon={Bell}
                title={rule.message} titleClassName="break-words"
                subtitle={rule.enabled ? t('settings.reminders.dailyTime') : t('settings.reminders.disabled')}
                meta={<span className="tabular-nums">{rule.trigger.time}</span>}
                ariaLabel={`${rule.trigger.time} · ${rule.message}${off}`}
                onClick={() => { if (!busy) edit(rule); }} />;
            })}
          </CompanionListSection> : <div className="border-y border-companion-divider py-8 text-center">
            <Bell aria-hidden="true" className="mx-auto mb-3 size-5 text-companion-text-tertiary" />
            <p className="font-medium text-foreground">{t('settings.reminders.empty')}</p>
          </div>)}
        </>}
        {status}
      </div>
    </CompanionSettingsDetail>
  );
}
