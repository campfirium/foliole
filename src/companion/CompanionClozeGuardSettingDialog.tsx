import { useState, type FormEvent } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppButton, AppDialogActions, AppDialogContent, AppDialogDescription, AppDialogOverlay,
  AppDialogPortal, AppDialogTitle, AppInput } from '../shared/ui';

import { CLOZE_GUARD_MODE_LABELS, type ClozeGuardSettingField } from './companionClozeGuardSettingFields';

export function CompanionClozeGuardSettingDialog(props: {
  field: ClozeGuardSettingField;
  value: string;
  onClose(): void;
  onSaved(value: string): void;
}) {
  const t = useTranslation();
  const [draft, setDraft] = useState(props.value);
  const [failed, setFailed] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const value = String(new FormData(event.currentTarget).get(props.field.key));
    try { props.onSaved(String(props.field.save(value))); }
    catch { setFailed(true); }
  }
  return <AppDialogPortal>
    <AppDialogOverlay />
    <AppDialogContent className="max-h-[80dvh] w-[calc(100vw-2rem)] max-w-md overflow-y-auto p-5">
      <AppDialogTitle className="text-base">{t(props.field.title)}</AppDialogTitle>
      <AppDialogDescription className="mt-2 text-sm">{t(props.field.description)}</AppDialogDescription>
      <form className="mt-5" onSubmit={submit}>
        {props.field.limits ? <AppInput autoFocus aria-label={t(props.field.label)} className="min-h-11 text-base tabular-nums"
          inputMode="numeric" min={props.field.limits.min} max={props.field.limits.max} step={1} type="number" required
          name={props.field.key} value={draft} onChange={event => { setDraft(event.target.value); setFailed(false); }} />
          : <select aria-label={t(props.field.label)}
            className="min-h-11 w-full rounded-md border border-companion-divider bg-background px-3 text-base text-foreground"
            name={props.field.key} value={draft} onChange={event => { setDraft(event.target.value); setFailed(false); }}>
            {Object.entries(CLOZE_GUARD_MODE_LABELS).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
          </select>}
        {failed ? <p className="mt-3 text-sm text-error" role="alert">{t('companion.settings.learning.saveError')}</p> : null}
        <AppDialogActions>
          <AppButton className="min-h-11" type="button" onClick={props.onClose}>{t('common.cancel')}</AppButton>
          <AppButton className="min-h-11" type="submit" variant="emphasis">
            {t(failed ? 'desktop.reviewCalendar.retry' : 'shared.confirm.confirm')}
          </AppButton>
        </AppDialogActions>
      </form>
    </AppDialogContent>
  </AppDialogPortal>;
}
