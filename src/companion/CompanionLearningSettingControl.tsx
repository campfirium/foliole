import { useRef, useState, type FocusEvent } from 'react';

import { getCurrentReviewSchedulerSettings, type ReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { saveCompanionReviewSettings } from '../shared/platform/companion/settings/companionReviewSchedulerSettingsRepository';
import { AppButton } from '../shared/ui';

import type { CompanionLearningSettingField } from './companionLearningSettingFields';
import { CompanionReadingNumberControl } from './CompanionReadingNumberControl';

function useSettingValue(field: CompanionLearningSettingField, current: number) {
  const [draft, setDraft] = useState(String(current));
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<number | null>(null);
  const pending = useRef(false);
  const cancel = useRef(false);
  const [confirmed, setConfirmed] = useState(current);
  if (confirmed !== current) {
    setConfirmed(current);
    setDraft(String(current));
    setFailed(null);
  }
  function save(value: number) {
    if (pending.current || !Number.isFinite(value) || value === current) return;
    pending.current = true;
    setSaving(true);
    setFailed(null);
    void saveCompanionReviewSettings(field.patch(value, getCurrentReviewSchedulerSettings()))
      .then(settings => setDraft(String(field.read(settings))))
      .catch(() => {
        setDraft(String(field.read(getCurrentReviewSchedulerSettings())));
        setFailed(value);
      }).finally(() => { pending.current = false; setSaving(false); });
  }
  function commit(event: FocusEvent<HTMLDivElement>) {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    const input = event.currentTarget.querySelector('input');
    if (!cancel.current && input?.value.trim() && input.validity.valid) save(Number(input.value));
    else setDraft(String(current));
    cancel.current = false;
  }
  return { draft, setDraft, saving, failed, cancel, save, commit };
}

type SettingValue = ReturnType<typeof useSettingValue>;

function PreciseNumberInput(props: { field: CompanionLearningSettingField; label: string; state: SettingValue }) {
  const { field, state } = props;
  return <input aria-label={props.label}
    className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none min-h-11 w-20 rounded-md bg-transparent px-1 text-right text-base tabular-nums text-companion-text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-companion-accent"
    disabled={state.saving} id={`learning-${field.key}`} inputMode={field.step === 1 ? 'numeric' : 'decimal'}
    max={field.max} min={field.min} onChange={event => state.setDraft(event.target.value)}
    onKeyDown={event => {
      if (event.key === 'Escape') { state.cancel.current = true; event.currentTarget.blur(); }
      if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
    }} required step={field.step} type="number" value={state.draft} />;
}

function SettingPicker(props: { field: CompanionLearningSettingField; label: string; state: SettingValue; value: number }) {
  const hour = props.field.key === 'newDayStartsAtHour';
  const id = `learning-${props.field.key}`;
  return <label className="flex min-h-14 items-center justify-between gap-3 border-b border-companion-divider py-2" htmlFor={id}>
    <span className="text-sm font-medium text-foreground">{props.label}</span>
    <select aria-label={props.label} className="min-h-11 rounded-md bg-transparent px-2 text-base tabular-nums text-companion-text-secondary"
      disabled={props.state.saving} id={id} onChange={event => {
        if (event.target.value) props.state.save(Number(event.target.value));
      }} value={props.value}>
      {Array.from({ length: hour ? 24 : 9 }, (_, index) => {
        const value = hour ? index : index + 1;
        return <option key={value} value={value}>{hour ? `${String(value).padStart(2, '0')}:00` : `P${value}`}</option>;
      })}
    </select>
  </label>;
}

export function CompanionLearningSettingControl(props: { field: CompanionLearningSettingField; settings: ReviewSchedulerSettings }) {
  const t = useTranslation();
  const current = props.field.read(props.settings);
  const state = useSettingValue(props.field, current);
  const label = t(props.field.label);
  const selection = props.field.key === 'newDayStartsAtHour' || props.field.key === 'defaultPriority';
  const numericDraft = state.draft.trim() && Number.isFinite(Number(state.draft)) ? Number(state.draft) : current;
  return <div onBlur={state.commit}>
    {selection ? <SettingPicker field={props.field} label={label} state={state} value={current} />
      : <CompanionReadingNumberControl disabled={state.saving} label={label} min={props.field.min}
        {...(props.field.max === undefined ? {} : { max: props.field.max })}
        onChange={state.save} step={props.field.step} value={numericDraft}
        valueControl={<PreciseNumberInput field={props.field} label={label} state={state} />} />}
    {state.failed !== null ? <div className="flex items-center justify-between gap-2 py-2 text-sm text-error" role="alert">
      <p>{t('companion.settings.learning.saveError')}</p>
      <AppButton disabled={state.saving} onClick={() => state.save(state.failed!)}>{t('desktop.reviewCalendar.retry')}</AppButton>
    </div> : null}
  </div>;
}
