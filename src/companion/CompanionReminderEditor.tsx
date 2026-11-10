import type { FormEvent } from 'react';

import { isReminderTriggerPast, type ReminderRule } from '../../lib/core/reminders/reminderRule';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppButton, AppInput } from '../shared/ui';

import { CompanionReminderChoice } from './CompanionReminderChoice';

export type ReminderDraft = { id?: string; message: string; trigger: ReminderRule['trigger']; destination?: ReminderRule['destination'] };

export function CompanionReminderEditor(props: {
  busy: boolean;
  draft: ReminderDraft;
  onCancel(): void;
  onChange(value: ReminderDraft): void;
  onSave(event: FormEvent<HTMLFormElement>): Promise<void>;
}) {
  const t = useTranslation();
  const { busy, draft, onChange } = props;
  const trigger = draft.trigger;
  const expired = isReminderTriggerPast(trigger);
  return <form className="space-y-5" aria-labelledby="companion-reminder-editor-title"
    onSubmit={event => void props.onSave(event)}>
    <h2 id="companion-reminder-editor-title" className="text-lg font-semibold text-foreground">
      {t(draft.id ? 'settings.reminders.edit' : 'settings.reminders.add')}
    </h2>
    <div className="space-y-4">
      <label className="block space-y-1.5 text-base font-medium">
        <span>{t('settings.reminders.message')}</span>
        <AppInput required className="min-h-11 text-base" disabled={busy} value={draft.message}
          onChange={event => onChange({ ...draft, message: event.currentTarget.value })} />
      </label>
      <CompanionReminderChoice label={t('settings.reminders.trigger')} disabled={busy}
        value={trigger.kind === 'foreground' ? 'foreground' : 'scheduled'}
        options={{ scheduled: t('settings.reminders.scheduled'), foreground: t('settings.reminders.foreground') }}
        onChange={kind => {
          if (kind === 'foreground' && trigger.kind !== 'foreground') onChange({ ...draft, trigger: { kind, minutes: 20 } });
          if (kind === 'scheduled' && trigger.kind === 'foreground') onChange({ ...draft, trigger: { kind: 'daily', time: '20:00' } });
        }} />
      {trigger.kind === 'foreground'
        ? <label className="flex min-h-14 flex-wrap items-center justify-between gap-2 text-base">
          <span>{t('settings.reminders.foregroundMinutes')}</span>
          <AppInput type="number" required min={1} max={1440} disabled={busy}
            className="min-h-11 w-24 text-base" value={trigger.minutes || ''}
            onChange={event => onChange({ ...draft, trigger: { kind: 'foreground', minutes: Number(event.currentTarget.value) } })} />
        </label>
        : <ScheduledFields busy={busy} trigger={trigger} onChange={next => onChange({ ...draft, trigger: next })} />}
      <div className="border-t border-companion-divider pt-2">
        <CompanionReminderChoice label={t('settings.reminders.onTap')} value={draft.destination ?? 'none'}
          options={{ none: t('settings.reminders.noDestination'), flow: t('settings.reminders.openFlow') }}
          disabled={busy} onChange={value => onChange({ ...draft, destination: value === 'flow' ? value : undefined })} />
      </div>
      <dl className="flex min-h-11 items-center justify-between gap-3 border-t border-companion-divider pt-2 text-base">
        <dt className="font-medium">{t('settings.reminders.device')}</dt>
        <dd className="text-companion-text-secondary">{t('settings.reminders.thisDevice')}</dd>
      </dl>
    </div>
    <div className="flex flex-wrap justify-end gap-2 border-t border-companion-divider pt-4">
      <AppButton variant="ghost" className="min-h-11" disabled={busy} onClick={props.onCancel}>{t('common.cancel')}</AppButton>
      <AppButton variant="emphasis" className="min-h-11" type="submit" loading={busy} disabled={expired}>{t('settings.reminders.save')}</AppButton>
    </div>
  </form>;
}

type ScheduledTrigger = Exclude<ReminderRule['trigger'], { kind: 'foreground' }>;

function ScheduledFields({ busy, trigger, onChange }: {
  busy: boolean;
  trigger: ScheduledTrigger;
  onChange(trigger: ScheduledTrigger): void;
}) {
  const t = useTranslation();
  const expired = isReminderTriggerPast(trigger);
  return (
      <div className="space-y-1.5 border-t border-companion-divider pt-2">
        <CompanionReminderChoice label={t('settings.reminders.repeat')} value={trigger.kind} disabled={busy}
          options={{ daily: t('settings.reminders.daily'), once: t('settings.reminders.noRepeat') }}
          onChange={kind => {
            if (kind !== trigger.kind) onChange(changeRepeat(trigger));
          }} />
        <label className="flex min-h-14 flex-wrap items-center justify-between gap-2 text-base">
          <span>{t(trigger.kind === 'once' ? 'settings.reminders.dateTime' : 'settings.reminders.time')}</span>
          {trigger.kind === 'once'
            ? <AppInput key="once" required type="datetime-local" className="min-h-11 w-auto max-w-full text-base"
              disabled={busy} value={toLocalDateTime(trigger.at)}
              onChange={event => {
                const date = new Date(event.currentTarget.value);
                onChange({ kind: 'once', at: Number.isFinite(date.getTime()) ? date.toISOString() : '' });
              }} />
            : <AppInput key="daily" required type="time" className="min-h-11 w-auto max-w-full text-base"
              disabled={busy} value={trigger.time}
              onChange={event => onChange({ kind: 'daily', time: event.currentTarget.value })} />}
        </label>
        {expired && <p className="text-sm">{t('settings.reminders.futureTime')}</p>}
      </div>
  );
}

function changeRepeat(trigger: ScheduledTrigger): ScheduledTrigger {
  if (trigger.kind === 'once') {
    return { kind: 'daily', time: toLocalDateTime(trigger.at).slice(11) || '20:00' };
  }
  const date = new Date();
  const [hour = 20, minute = 0] = (trigger.time || '20:00').split(':').map(Number);
  date.setHours(hour, minute, 0, 0);
  if (date.getTime() <= Date.now()) date.setDate(date.getDate() + 1);
  return { kind: 'once', at: date.toISOString() };
}

function toLocalDateTime(at: string) {
  if (!at) return '';
  const date = new Date(at);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
