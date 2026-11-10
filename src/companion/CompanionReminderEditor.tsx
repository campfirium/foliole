import type { FormEvent } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppButton, AppInput, AppSwitch } from '../shared/ui';

export type ReminderDraft = { id?: string; message: string; time: string; enabled: boolean };

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
      <label className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-y border-companion-divider py-2 text-sm">
        <span>{t('settings.reminders.dailyTime')}</span>
        <AppInput required type="time" className="min-h-11 w-auto max-w-full text-base tabular-nums"
          disabled={busy} value={draft.time}
          onChange={event => onChange({ ...draft, time: event.currentTarget.value })} />
      </label>
      <div className="flex min-h-11 items-center justify-between gap-3 text-sm">
        <span>{t('settings.reminders.enabled')}</span>
        <AppSwitch aria-label={t('settings.reminders.enabled')} checked={draft.enabled} disabled={busy}
          onCheckedChange={enabled => onChange({ ...draft, enabled })} />
      </div>
    </div>
    <div className="flex flex-wrap justify-end gap-2 border-t border-companion-divider pt-4">
      <AppButton variant="ghost" className="min-h-11" disabled={busy} onClick={props.onCancel}>{t('common.cancel')}</AppButton>
      <AppButton variant="emphasis" className="min-h-11" type="submit" loading={busy}>{t('settings.reminders.save')}</AppButton>
    </div>
  </form>;
}
