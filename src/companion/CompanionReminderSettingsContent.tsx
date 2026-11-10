import { useEffect, useState, type FormEvent } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { DEFAULT_REMINDER_PRESETS } from '../../lib/core/reminders/reminderPresets';
import {
  isReminderForDevice, isReminderTriggerPast, type ReminderDevice, type ReminderRule
} from '../../lib/core/reminders/reminderRule';
import { useReminderDraftRequest } from '../features/settings/context/ReminderDraftRequest';
import { listVisibleDives } from '../shared/diveMembership';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { reconcileCompanionReminders } from '../shared/platform/companion/settings/companionReminderNotifications';
import {
  loadCompanionReminderDevice, loadCompanionReminderRules, saveCompanionReminderRule
} from '../shared/platform/companion/settings/companionReminderRepository';
import { createCompanionUuid } from '../shared/platform/companionUuid';
import { AppSwitch } from '../shared/ui';

import { CompanionListSection } from './CompanionListSurface';
import { CompanionReminderEditor, type ReminderDraft } from './CompanionReminderEditor';
import { CompanionSettingsDetail } from './CompanionSettingsContent';

function withDefaultRules(rules: ReminderRule[], device: ReminderDevice) {
  return [...rules, ...DEFAULT_REMINDER_PRESETS.filter(defaultRule => !rules.some(rule =>
    rule.preset === defaultRule.preset && isReminderForDevice(rule, device)
  )).map(rule => ({
    ...rule, id: createCompanionUuid(), revision: createCompanionUuid(), device
  }))];
}

function useReminderSettings() {
  const [rules, setRules] = useState<ReminderRule[]>([]);
  const [device, setDevice] = useState<ReminderDevice>();
  const [draft, setDraft] = useState<ReminderDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<'failed' | 'permission' | 'exactPermission' | 'unavailable'>();

  useEffect(() => {
    let active = true;
    void Promise.all([loadCompanionReminderRules(), loadCompanionReminderDevice()]).then(([loaded, current]) => {
      if (active) { setRules(withDefaultRules(loaded, current)); setDevice(current); }
    }).catch(() => { if (active) setFeedback('unavailable'); });
    return () => { active = false; };
  }, []);

  async function persist(rule: ReminderRule, closeEditor = false) {
    if (!device || busy) return;
    setBusy(true);
    setFeedback(undefined);
    try {
      await saveCompanionReminderRule(rule);
      const updated = await loadCompanionReminderRules();
      setRules(withDefaultRules(updated, device));
      const result = await reconcileCompanionReminders(updated, device, rule.enabled).catch(() => 'failed' as const);
      if (result === 'permission-denied') setFeedback('permission');
      else if (result === 'exact-permission-denied') setFeedback('exactPermission');
      else if (result === 'failed') setFeedback('failed');
      if (closeEditor) setDraft(null);
    } catch {
      setFeedback('unavailable');
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!device || !draft?.message.trim() || isReminderTriggerPast(draft.trigger)) return;
    const current = rules.find(rule => rule.id === draft.id);
    if (draft.id && !current) return;
    await persist({
      id: current?.id ?? createCompanionUuid(), preset: current?.preset, enabled: current?.enabled ?? false,
      revision: createCompanionUuid(), message: draft.message.trim(),
      trigger: draft.trigger, destination: draft.destination, device
    }, true);
  }

  function toggle(rule: ReminderRule, enabled: boolean) {
    return persist({ ...rule, revision: createCompanionUuid(), enabled });
  }

  return { busy, device, draft, feedback, rules, save, setDraft, toggle };
}

export function CompanionReminderSettingsContent(props: { onBack(): void; snapshot?: WorkspaceSnapshot | null }) {
  const t = useTranslation();
  const { busy, device, draft, feedback, rules, save, setDraft, toggle } = useReminderSettings();
  const takeDive = useReminderDraftRequest()?.takeDive;
  useEffect(() => {
    const dive = takeDive?.();
    if (dive) setDraft({ message: dive.title, trigger: { kind: 'daily', time: '20:00' },
      destination: { kind: 'dive', diveId: dive.id } });
  }, [setDraft, takeDive]);
  const dives = props.snapshot ? listVisibleDives(props.snapshot) : [];
  const localRules = device ? rules.filter(rule => isReminderForDevice(rule, device)) : [];
  const edit = (rule: ReminderRule) => setDraft({
    id: rule.id, message: rule.message, trigger: rule.trigger, destination: rule.destination
  });
  const status = feedback && <p role="status" className="text-sm leading-5 text-companion-text-secondary">
    {t(`settings.reminders.${feedback}`)}
  </p>;
  return (
    <CompanionSettingsDetail onBack={props.onBack} page="reminders" title={t('settings.reminders.title')}>
      <div className="space-y-2 py-2">
        {draft ? <CompanionReminderEditor busy={busy} draft={draft} dives={dives} onChange={setDraft}
          onCancel={() => setDraft(null)} onSave={save} /> : <>
          {device && localRules.length > 0 && <CompanionListSection isFirst>
            {localRules.map(rule => {
              const expired = isReminderTriggerPast(rule.trigger);
              const schedule = rule.trigger.kind === 'daily'
                ? t('settings.reminders.dailyAt', { time: rule.trigger.time })
                : rule.trigger.kind === 'foreground'
                  ? t('settings.reminders.foregroundAt', { minutes: rule.trigger.minutes })
                  : t('settings.reminders.onceAt', { time: new Date(rule.trigger.at).toLocaleString() });
              const target = rule.destination;
              const destination = target === 'flow' ? t('settings.reminders.openFlow') : target &&
                (dives.find(dive => dive.id === target.diveId)?.title ?? t('settings.reminders.diveUnavailable'));
              const detail = expired ? t('settings.reminders.timePassed') : t('settings.reminders.thisDevice');
              return <div key={rule.id} className="flex min-h-16 items-center gap-3 border-b border-companion-divider last:border-b-0">
                <button type="button" disabled={busy} className="min-h-16 min-w-0 flex-1 py-3 text-left"
                  aria-label={`${t('settings.reminders.edit')}: ${rule.message}`} onClick={() => edit(rule)}>
                  <span className="block break-words text-lg font-medium">{rule.message}</span>
                  <span className="mt-1 block text-base text-companion-text-secondary">
                    {[schedule, detail, destination].filter(Boolean).join(' · ')}
                  </span>
                </button>
                <AppSwitch className="shrink-0" aria-label={`${t('settings.reminders.enabled')}: ${rule.message}`}
                  checked={rule.enabled && !expired} disabled={busy || expired} onCheckedChange={enabled => void toggle(rule, enabled)} />
              </div>;
            })}
          </CompanionListSection>}
          <button type="button" disabled={busy || !device}
            className="mt-2 min-h-12 w-full rounded-md border border-dashed border-companion-divider-strong px-3 text-base text-companion-text-secondary hover:bg-companion-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-companion-accent disabled:opacity-50"
            onClick={() => setDraft({ message: '', trigger: { kind: 'daily', time: '20:00' } })}>
            {t('settings.reminders.add')}
          </button>
        </>}
        {status}
      </div>
    </CompanionSettingsDetail>
  );
}
