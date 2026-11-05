import { ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppButton } from '../shared/ui';
import { AppDialog, AppDialogTrigger } from '../shared/ui/Dialog';

import { CompanionClozeGuardSettingDialog } from './CompanionClozeGuardSettingDialog';
import { CLOZE_GUARD_MODE_LABELS, CLOZE_GUARD_SETTING_FIELDS, type ClozeGuardSettingField } from './companionClozeGuardSettingFields';

function readSettings() {
  try { return Object.fromEntries(CLOZE_GUARD_SETTING_FIELDS.map(field => [field.key, String(field.read())])); }
  catch { return null; }
}

export function CompanionClozeGuardSettingsContent() {
  const t = useTranslation();
  const [settings, setSettings] = useState(readSettings);
  if (!settings) return <div role="alert">
    <p>{t('companion.settings.clozeGuard.loadError')}</p>
    <AppButton onClick={() => setSettings(readSettings())}>{t('desktop.reviewCalendar.retry')}</AppButton>
  </div>;
  return <section aria-label={t('settings.editor.clozeGuard.aria')}>
    {CLOZE_GUARD_SETTING_FIELDS.map(field => <ClozeGuardSettingRow key={field.key} field={field}
      value={settings[field.key]!} onSaved={value => setSettings(previous => ({ ...previous, [field.key]: value }))} />)}
  </section>;
}

function ClozeGuardSettingRow(props: { field: ClozeGuardSettingField; value: string; onSaved(value: string): void }) {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  const display = props.field.key === 'mode' ? t(CLOZE_GUARD_MODE_LABELS[props.value as keyof typeof CLOZE_GUARD_MODE_LABELS]) : props.value;
  return <AppDialog open={open} onOpenChange={setOpen}>
    <AppDialogTrigger asChild>
      <button aria-label={`${t(props.field.title)} ${display}`} className="flex min-h-14 w-full items-center justify-between gap-3 border-b border-companion-divider py-3 text-left active:bg-companion-subtle/80" type="button">
        <span className="text-sm font-medium text-foreground">{t(props.field.title)}</span>
        <span className="flex shrink-0 items-center gap-2 text-base tabular-nums text-companion-text-secondary">
          {display}<ChevronRight aria-hidden="true" size={16} />
        </span>
      </button>
    </AppDialogTrigger>
    {open ? <CompanionClozeGuardSettingDialog field={props.field} value={props.value} onClose={() => setOpen(false)}
      onSaved={value => { props.onSaved(value); setOpen(false); }} /> : null}
  </AppDialog>;
}
