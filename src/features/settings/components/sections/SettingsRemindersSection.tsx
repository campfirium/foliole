import { ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import type { Dive } from '../../../../../lib/core/nodes/dive';
import { DEFAULT_REMINDER_PRESETS } from '../../../../../lib/core/reminders/reminderPresets';
import type { ReminderRule } from '../../../../../lib/core/reminders/reminderRule';
import type { DesktopReminderDraft } from '../../../../../lib/platform/nativeReminderContract';
import { listVisibleDives } from '../../../../shared/diveMembership';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { getDesktopReminderRepository } from '../../../../shared/platform/desktop/desktopReminderRepository';
import { AppButton, AppInput, AppSwitch, SettingsControlSlot, SettingsRow, SettingsSection, SettingsSegmentedControl } from '../../../../shared/ui';
import { useWorkspaceStore } from '../../../../store/workspaceStore';
import { useReminderDraftRequest } from '../../context/ReminderDraftRequest';

import { DesktopReminderDestinationFields } from './DesktopReminderDestinationFields';
import { DesktopReminderNotificationNotice, useDesktopReminderNotificationPermission } from './DesktopReminderNotificationNotice';

const initialDraft: DesktopReminderDraft = { message: '', trigger: { kind: 'daily', time: '20:00' }, enabled: false };
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

function ReminderTriggerFields({ trigger, pending, onChange }: {
  trigger: DesktopReminderDraft['trigger'];
  pending: boolean;
  onChange: (trigger: DesktopReminderDraft['trigger']) => void;
}) {
  const t = useTranslation();
  const isDaily = trigger.kind === 'daily';
  const timingLabel = t(isDaily ? 'settings.reminders.time' : 'settings.reminders.foregroundMinutes');

  return <>
    <SettingsRow title={t('settings.reminders.trigger')} className={inlineRow}>
      <SettingsSegmentedControl ariaLabel={t('settings.reminders.trigger')} disabled={pending}
        value={trigger.kind} options={[
          { value: 'daily', label: t('settings.reminders.scheduled') },
          { value: 'foreground', label: t('settings.reminders.foreground') }
        ]} onChange={kind => {
          if (kind !== trigger.kind) onChange(kind === 'foreground'
            ? { kind: 'foreground', minutes: 20 } : initialDraft.trigger);
        }} />
    </SettingsRow>
    <SettingsRow title={timingLabel} description={isDaily ? t('settings.reminders.daily') : undefined} className={inlineRow}>
      <SettingsControlSlot className="w-32 max-[1080px]:w-32 max-[1080px]:flex-[0_0_auto]">
        {isDaily
          ? <AppInput aria-label={timingLabel} required disabled={pending} type="time" value={trigger.time}
            onChange={event => onChange({ kind: 'daily', time: event.currentTarget.value })} />
          : <AppInput aria-label={timingLabel} required disabled={pending} type="number" min={1} max={1440}
            value={trigger.minutes || ''} onChange={event => onChange({ kind: 'foreground', minutes: Number(event.currentTarget.value) })} />}
      </SettingsControlSlot>
    </SettingsRow>
  </>;
}

function ReminderForm({ draft, dives, pending, onChange, onSubmit, onCancel }: {
  draft: DesktopReminderDraft;
  dives: Dive[];
  pending: boolean;
  onChange: (draft: DesktopReminderDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const t = useTranslation();
  const editing = Boolean(draft.previous || draft.preset);
  const editLabel = t(editing ? 'settings.reminders.edit' : 'settings.reminders.add');

  return (
    <form aria-label={editLabel} className="max-w-2xl" onSubmit={onSubmit}>
      {editing && <h3 className="px-settings-panel-x pb-2 text-ui-lg font-medium">{editLabel}</h3>}
      <label className="block space-y-2 px-settings-panel-x py-settings-panel-y text-ui-lg">
        <span>{t('settings.reminders.message')}</span>
        <AppInput required disabled={pending} className="max-w-[360px]" value={draft.message}
          onChange={event => onChange({ ...draft, message: event.currentTarget.value })} />
      </label>
      <ReminderTriggerFields trigger={draft.trigger} pending={pending} onChange={trigger => onChange({ ...draft, trigger })} />
      <DesktopReminderDestinationFields destination={draft.destination} dives={dives} pending={pending}
        onChange={destination => onChange({ ...draft, destination })} />
      <SettingsRow title={t('settings.reminders.device')} className={inlineRow} readonly>
        <span className="text-ui-md text-muted-foreground">{t('settings.reminders.thisDevice')}</span>
      </SettingsRow>
      <div className="mx-settings-panel-x mt-2 flex justify-end gap-2 border-t border-settings-divider/70 pt-4">
        <AppButton variant="ghost" onClick={onCancel} disabled={pending}>{t('common.cancel')}</AppButton>
        <AppButton variant="emphasis" type="submit" loading={pending} disabled={!draft.message.trim() || (typeof draft.destination === 'object' && !draft.destination.diveId)}>
          {t('settings.reminders.save')}
        </AppButton>
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

export function SettingsRemindersSection() {
  const t = useTranslation();
  const { status, requestPermission, requesting } = useDesktopReminderNotificationPermission();
  const { rules, pending, failed, save } = useDesktopReminders(requestPermission);
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
      {draft ? <ReminderForm draft={draft} dives={dives} pending={pending} onChange={setDraft}
        onSubmit={event => void submit(event)} onCancel={() => setDraft(null)} /> : <>
        {rules && desktopReminderDrafts(rules).map(current => {
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
                disabled={pending} onClick={() => setDraft(current)}>
                <span className="min-w-0">
                  <span className="block break-words text-ui-lg font-medium text-foreground">{current.message}</span>
                  <span className="mt-0.5 block text-ui-md text-muted-foreground">{[schedule, destination].filter(Boolean).join(' · ')}</span>
                </span>
                <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              </AppButton>
              <AppSwitch aria-label={`${t('settings.reminders.enabled')}: ${current.message}`} compact checked={current.enabled}
                disabled={pending} onCheckedChange={enabled => void save({ ...current, enabled })} />
            </SettingsRow>
          );
        })}
        <div className="px-settings-panel-x pt-3">
          <AppButton className="w-full border-dashed" disabled={!rules || pending} onClick={() => setDraft(initialDraft)}>
            {t('settings.reminders.add')}
          </AppButton>
        </div>
      </>}
    </SettingsSection>
  );
}
