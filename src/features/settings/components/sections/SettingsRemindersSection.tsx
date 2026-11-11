import { ChevronRight } from 'lucide-react';
import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';

import type { Dive } from '../../../../../lib/core/nodes/dive';
import { DEFAULT_REMINDER_PRESETS } from '../../../../../lib/core/reminders/reminderPresets';
import { DAILY_REMINDER_TIME_PATTERN, type ReminderRule } from '../../../../../lib/core/reminders/reminderRule';
import type { DesktopReminderDraft } from '../../../../../lib/platform/nativeReminderContract';
import { listVisibleDives } from '../../../../shared/diveMembership';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { getDesktopReminderRepository } from '../../../../shared/platform/desktop/desktopReminderRepository';
import { AppButton, AppInput, AppSwitch, SettingsRow, SettingsSection, settingsFieldClassName } from '../../../../shared/ui';
import { useWorkspaceStore } from '../../../../store/workspaceStore';
import { useReminderDraftRequest } from '../../context/ReminderDraftRequest';

import { DesktopReminderDestinationFields } from './DesktopReminderDestinationFields';
import { DesktopReminderNotificationNotice, useDesktopReminderNotificationPermission } from './DesktopReminderNotificationNotice';

const initialDraft: DesktopReminderDraft = { message: '', trigger: { kind: 'daily', time: '20:00' }, enabled: true };
const inlineRow = 'items-center gap-3 max-[1080px]:flex-row max-[1080px]:items-center';

function useDesktopReminders(requestPermission: () => void) {
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
      setRules(items => items?.some(rule => rule.id === saved.id)
        ? items.map(rule => rule.id === saved.id ? saved : rule)
        : [...(items ?? []), saved]);
      if (saved.enabled || !draft.previous) requestPermission();
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

function ReminderForm({ id, draft, dives, pending, onChange, onSubmit }: {
  id: string;
  draft: DesktopReminderDraft;
  dives: Dive[];
  pending: boolean;
  onChange: (draft: DesktopReminderDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const t = useTranslation();
  const { trigger } = draft;
  const message = t('settings.reminders.message');

  return (
    <form id={id} aria-label={t(draft.previous || draft.preset ? 'settings.reminders.edit' : 'settings.reminders.add')}
      className="mx-settings-panel-x space-y-2 border-t border-settings-divider/70 py-3" onSubmit={onSubmit}>
      <AppInput aria-label={message} placeholder={message} required disabled={pending} value={draft.message}
        onChange={event => onChange({ ...draft, message: event.currentTarget.value })} />
      <div className="-mx-1 overflow-x-auto p-1">
        <div className="grid min-w-[38rem] grid-cols-[minmax(8rem,1fr)_6rem_minmax(9rem,1fr)_minmax(6rem,2fr)_7rem] items-center gap-2">
          <select aria-label={t('settings.reminders.trigger')} className={settingsFieldClassName()} disabled={pending}
            value={trigger.kind} onChange={event => onChange({ ...draft, trigger: event.currentTarget.value === 'foreground'
              ? { kind: 'foreground', minutes: 20 } : initialDraft.trigger })}>
            <option value="daily">{t('settings.reminders.daily')}</option>
            <option value="foreground">{t('settings.reminders.foreground')}</option>
          </select>
          {trigger.kind === 'daily'
            ? <AppInput aria-label={t('settings.reminders.time')} required disabled={pending} type="text"
              className="h-9 text-center tabular-nums" maxLength={5} placeholder="20:00"
              pattern={DAILY_REMINDER_TIME_PATTERN.source} value={trigger.time}
              onChange={event => onChange({ ...draft, trigger: { kind: 'daily', time: event.currentTarget.value } })} />
            : <div className="flex items-center gap-1">
              <AppInput aria-label={t('settings.reminders.foregroundMinutes')} required disabled={pending}
                className="h-9 min-w-0 px-2" type="number" min={1} max={1440} value={trigger.minutes || ''}
                onChange={event => onChange({ ...draft, trigger: { kind: 'foreground', minutes: Number(event.currentTarget.value) } })} />
              <span aria-hidden="true" className="shrink-0 text-ui-sm text-muted-foreground">{t('settings.reminders.minuteUnit')}</span>
            </div>}
          <DesktopReminderDestinationFields destination={draft.destination} dives={dives} pending={pending}
            onChange={destination => onChange({ ...draft, destination })} />
          <select aria-label={t('settings.reminders.device')} className={settingsFieldClassName('col-start-5')} disabled={pending}>
            <option>{t('settings.reminders.thisDevice')}</option>
          </select>
        </div>
      </div>
    </form>
  );
}

function desktopReminderDrafts(rules: ReminderRule[]): DesktopReminderDraft[] {
  const drafts = rules.flatMap(rule => rule.trigger.kind === 'once' ? [] : [{
    previous: { id: rule.id, revision: rule.revision }, message: rule.message,
    trigger: rule.trigger, enabled: rule.enabled, destination: rule.destination, preset: rule.preset
  }]);
  return [...drafts, ...DEFAULT_REMINDER_PRESETS.filter(preset => !drafts.some(draft => draft.preset === preset.preset))];
}

function ReminderList({ rules, dives, disabled, onEdit, onToggle }: {
  rules: ReminderRule[];
  dives: Dive[];
  disabled: boolean;
  onEdit: (draft: DesktopReminderDraft) => void;
  onToggle: (draft: DesktopReminderDraft) => void;
}) {
  const t = useTranslation();
  return desktopReminderDrafts(rules).map(current => {
    const schedule = current.trigger.kind === 'daily'
      ? t('settings.reminders.dailyAt', { time: current.trigger.time })
      : t('settings.reminders.foregroundAt', { minutes: current.trigger.minutes });
    const target = current.destination;
    const destination = target === 'flow' ? t('settings.reminders.openFlow') : target &&
      (dives.find(dive => dive.id === target.diveId)?.title ?? t('settings.reminders.diveUnavailable'));
    return (
      <SettingsRow key={current.previous?.id ?? current.preset} className={inlineRow}>
        <AppButton variant="ghost" className="min-w-0 flex-1 justify-between px-2 py-2 text-left"
          contentClassName="w-full min-w-0 justify-between"
          aria-label={`${t('settings.reminders.edit')}: ${current.message}`}
          disabled={disabled} onClick={() => onEdit(current)}>
          <span className="min-w-0">
            <span className="block break-words text-ui-lg font-medium text-foreground">{current.message}</span>
            <span className="mt-0.5 block text-ui-md text-muted-foreground">{[schedule, destination].filter(Boolean).join(' · ')}</span>
          </span>
          <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        </AppButton>
        <AppSwitch aria-label={`${t('settings.reminders.enabled')}: ${current.message}`} compact checked={current.enabled}
          disabled={disabled} onCheckedChange={enabled => onToggle({ ...current, enabled })} />
      </SettingsRow>
    );
  });
}

export function SettingsRemindersSection() {
  const t = useTranslation();
  const { status, requestPermission, requesting } = useDesktopReminderNotificationPermission();
  const { rules, pending, failed, save } = useDesktopReminders(requestPermission);
  const formId = useId();
  const [draft, setDraft] = useState<DesktopReminderDraft | null>(null);
  const takeDive = useReminderDraftRequest()?.takeDive;
  useEffect(() => {
    const dive = takeDive?.();
    if (dive) setDraft({ ...initialDraft, message: dive.title, destination: { kind: 'dive', diveId: dive.id } });
  }, [takeDive]);
  const nodesById = useWorkspaceStore(state => state.nodesById);
  const nodeOrder = useWorkspaceStore(state => state.nodeOrder);
  const trashedNodeIds = useWorkspaceStore(state => state.trashedNodeIds);
  const dives = useMemo(() => listVisibleDives({ nodeOrder, nodesById, trashedNodeIds }), [nodeOrder, nodesById, trashedNodeIds]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft && await save(draft)) setDraft(null);
  }

  return (
    <SettingsSection ariaLabel={t('settings.reminders.title')}>
      <DesktopReminderNotificationNotice status={status} requesting={requesting} requestPermission={requestPermission} />
      {failed && <p role="alert" className="px-settings-panel-x pb-3 text-ui-md">{t('settings.reminders.unavailable')}</p>}
      <div className="flex items-center justify-between gap-2 px-settings-panel-x pb-3">
        <h3 className="text-ui-lg font-medium">{t('settings.reminders.title')}</h3>
        {draft ? <div className="flex items-center gap-2">
          <AppButton variant="ghost" onClick={() => setDraft(null)} disabled={pending}>{t('common.cancel')}</AppButton>
          <AppButton variant="emphasis" type="submit" form={formId} loading={pending}
            disabled={!draft.message.trim() || (typeof draft.destination === 'object' && !draft.destination.diveId)}>
            {t('settings.reminders.save')}
          </AppButton>
        </div> : <AppButton disabled={!rules || pending} onClick={() => setDraft(initialDraft)}>
          {t('settings.reminders.add')}
        </AppButton>}
      </div>
      {draft && <ReminderForm id={formId} draft={draft} dives={dives} pending={pending} onChange={setDraft}
        onSubmit={event => void submit(event)} />}
      {rules && <ReminderList rules={rules} dives={dives} disabled={pending || Boolean(draft)}
        onEdit={setDraft} onToggle={current => void save(current)} />}
    </SettingsSection>
  );
}
