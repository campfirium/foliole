import { useRef, useState, type FormEvent } from 'react';

import { getCurrentReviewSchedulerSettings, type ReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { saveCompanionReviewSettings } from '../shared/platform/companion/settings/companionReviewSchedulerSettingsRepository';
import { AppButton, AppDialogActions, AppDialogContent, AppDialogDescription, AppDialogOverlay,
  AppDialogPortal, AppDialogTitle, AppInput } from '../shared/ui';

import { getLearningRowFields, getLearningRowPatch, type CompanionLearningSettingRow } from './companionLearningSettingRows';

function useLearningSettingDraft(row: CompanionLearningSettingRow, settings: ReviewSchedulerSettings, onClose: () => void) {
  const fields = getLearningRowFields(row);
  const [draft, setDraft] = useState(() => fields.map(field => String(field.read(settings))));
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = useRef(false);
  function change(index: number, value: string) {
    setDraft(previous => {
      const next = [...previous];
      next[index] = value;
      if (row.key === 'readingGrowth' && value.trim() && Number(value) >= 1) {
        if (index === 0 && Number(value) > Number(next[1])) next[1] = value;
        if (index === 1 && Number(value) < Number(next[0])) next[0] = value;
      }
      return next;
    });
    setFailed(false);
  }
  async function save(values: number[]) {
    if (pending.current || values.some((value, index) => !Number.isFinite(value) || value < fields[index]!.min
      || value > (fields[index]!.max ?? Infinity))) return;
    pending.current = true;
    setSaving(true);
    setFailed(false);
    try {
      await saveCompanionReviewSettings(getLearningRowPatch(row, values, getCurrentReviewSchedulerSettings()));
      onClose();
    } catch { setFailed(true); }
    finally { pending.current = false; setSaving(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const values = fields.map(field => Number(new FormData(event.currentTarget).get(field.key)));
    void save(values);
  }
  return { fields, draft, saving, failed, change, save, submit };
}

export function CompanionLearningSettingDialog(props: {
  row: CompanionLearningSettingRow;
  settings: ReviewSchedulerSettings;
  onClose(): void;
}) {
  const t = useTranslation();
  const state = useLearningSettingDraft(props.row, props.settings, props.onClose);
  const selection = props.row.key === 'newDayStartsAtHour' || props.row.key === 'defaultPriority';
  const hour = props.row.key === 'newDayStartsAtHour';
  return <AppDialogPortal>
    <AppDialogOverlay />
    <AppDialogContent className="max-h-[80dvh] w-[calc(100vw-2rem)] max-w-md overflow-y-auto p-5"
      onEscapeKeyDown={event => { if (state.saving) event.preventDefault(); }}
      onInteractOutside={event => { if (state.saving) event.preventDefault(); }}>
      <AppDialogTitle className="text-base">{t(props.row.title)}</AppDialogTitle>
      <AppDialogDescription className="mt-2 text-sm">{t(props.row.description)}</AppDialogDescription>
      <form className="mt-5" onSubmit={state.submit}>
        {selection ? <select aria-label={t(state.fields[0]!.label)}
          className="min-h-11 w-full rounded-md border border-companion-divider bg-background px-3 text-base text-foreground"
          disabled={state.saving} name={state.fields[0]!.key} value={state.draft[0]}
          onChange={event => {
            if (event.target.value) { state.change(0, event.target.value); void state.save([Number(event.target.value)]); }
          }}>
          {Array.from({ length: hour ? 24 : 9 }, (_, index) => {
            const value = hour ? index : index + 1;
            return <option key={value} value={value}>{hour ? `${String(value).padStart(2, '0')}:00` : `P${value}`}</option>;
          })}
        </select> : <div className="flex items-end gap-3">
          {state.fields.map((field, index) => <label className="min-w-0 flex-1" key={field.key}>
            {state.fields.length > 1 ? <span className="mb-2 block text-sm text-companion-text-secondary">{t(field.label)}</span> : null}
            <AppInput aria-label={t(field.label)} className="min-h-11 text-base tabular-nums"
              disabled={state.saving} id={`learning-${field.key}`} inputMode={field.step === 1 ? 'numeric' : 'decimal'}
              max={field.max} min={field.min} name={field.key} onChange={event => state.change(index, event.target.value)}
              required step={field.step} type="number" value={state.draft[index]} />
          </label>)}
        </div>}
        {state.failed ? <p className="mt-3 text-sm text-error" role="alert">{t('companion.settings.learning.saveError')}</p> : null}
        <AppDialogActions>
          <AppButton className="min-h-11" disabled={state.saving} onClick={props.onClose} type="button">{t('common.cancel')}</AppButton>
          {!selection || state.failed ? <AppButton className="min-h-11" disabled={state.saving} type="submit" variant="emphasis">
            {t(state.failed ? 'desktop.reviewCalendar.retry' : 'shared.confirm.confirm')}
          </AppButton> : null}
        </AppDialogActions>
      </form>
    </AppDialogContent>
  </AppDialogPortal>;
}
