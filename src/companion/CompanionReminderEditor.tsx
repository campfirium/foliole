import type { FormEvent } from 'react';

import type { ReminderRule } from '../../lib/core/reminders/reminderRule';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppButton, AppInput } from '../shared/ui';

export type ReminderDraft = { id?: string; message: string; trigger: ReminderRule['trigger'] };

export function CompanionReminderEditor(props: {
  busy: boolean;
  draft: ReminderDraft;
  onCancel(): void;
  onChange(value: ReminderDraft): void;
  onSave(event: FormEvent<HTMLFormElement>): Promise<void>;
}) {
  const t = useTranslation();
  const { busy, draft, onChange } = props;
  return <form className="space-y-5" aria-labelledby="companion-reminder-editor-title"
    onSubmit={event => void props.onSave(event)}>
    <h2 id="companion-reminder-editor-title" className="text-lg font-semibold text-foreground">
      {t(draft.id ? 'settings.reminders.edit' : 'settings.reminders.add')}
    </h2>
    <div className="space-y-4">
      <label className="block space-y-1.5 text-sm font-medium">
        <span>{t('settings.reminders.message')}</span>
        <AppInput required className="min-h-11 text-base" disabled={busy} value={draft.message}
          onChange={event => onChange({ ...draft, message: event.currentTarget.value })} />
      </label>
      <fieldset className="space-y-1.5 border-t border-companion-divider pt-2">
        <legend className="text-sm font-medium">{t('settings.reminders.trigger')}</legend>
        <p className="text-sm text-companion-text-secondary">{t('settings.reminders.daily')}</p>
        <label className="flex min-h-14 flex-wrap items-center justify-between gap-2 text-sm">
          <span>{t('settings.reminders.time')}</span>
          <AppInput required type="time" className="min-h-11 w-auto max-w-full text-base tabular-nums"
            disabled={busy} value={draft.trigger.time}
            onChange={event => onChange({ ...draft, trigger: { ...draft.trigger, time: event.currentTarget.value } })} />
        </label>
      </fieldset>
      <dl className="flex min-h-11 items-center justify-between gap-3 border-t border-companion-divider pt-2 text-sm">
        <dt className="font-medium">{t('settings.reminders.device')}</dt>
        <dd className="text-companion-text-secondary">{t('settings.reminders.thisDevice')}</dd>
      </dl>
    </div>
    <div className="flex flex-wrap justify-end gap-2 border-t border-companion-divider pt-4">
      <AppButton variant="ghost" className="min-h-11" disabled={busy} onClick={props.onCancel}>{t('common.cancel')}</AppButton>
      <AppButton variant="emphasis" className="min-h-11" type="submit" loading={busy}>{t('settings.reminders.save')}</AppButton>
    </div>
  </form>;
}
