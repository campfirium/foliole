import { ArrowUp, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import {
  addWebLookupEntry,
  getWebLookupEntries,
  moveWebLookupEntry,
  removeWebLookupEntry,
  updateWebLookupEntry,
  type WebLookupEntry
} from '../shared/platform/webLookupEntries';
import { isValidUrlTemplate } from '../shared/platform/webLookupTemplateResolution';
import { AppButton, AppDialog, AppDialogActions, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle, AppInput,
  settingsSwitchClassName, settingsSwitchKnobClassName } from '../shared/ui';

function isRemovable(entry: WebLookupEntry) {
  return !entry.builtIn;
}

export function CompanionWebLookupSettingsContent() {
  const t = useTranslation();
  const [entries, setEntries] = useState(getWebLookupEntries);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = entries.find(entry => entry.id === editingId) ?? null;
  function add() {
    const next = addWebLookupEntry();
    setEntries(next);
    setEditingId(next.at(-1)?.id ?? null);
  }
  return <section aria-label={t('companion.settings.webLookup.title')} className="pb-4">
    <p className="py-3 text-sm leading-6 text-companion-text-secondary">{t('companion.settings.webLookup.description')}</p>
    {entries.map((entry, index) => <div key={entry.id} className="flex min-h-14 items-center gap-2 border-b border-companion-divider py-2"
      data-testid={`companion-web-lookup-row-${entry.id}`}>
      <button aria-label={t('companion.settings.webLookup.edit', { label: entry.label })}
        className="flex min-w-0 flex-1 items-center gap-2 text-left active:opacity-70" onClick={() => setEditingId(entry.id)} type="button">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{entry.label}</span>
          <span className="block truncate text-xs text-companion-text-secondary">{entry.urlTemplate}</span>
        </span>
        <ChevronRight aria-hidden="true" className="shrink-0 text-companion-text-secondary" size={16} />
      </button>
      {index > 0 ? <button aria-label={t('settings.webLookup.move', { label: entry.label })}
        className="flex size-9 shrink-0 items-center justify-center rounded-md text-companion-text-secondary active:bg-companion-subtle"
        onClick={() => setEntries(moveWebLookupEntry(entry.id, entries[index - 1]!.id))} type="button">
        <ArrowUp aria-hidden="true" size={16} />
      </button> : <span aria-hidden="true" className="size-9 shrink-0" />}
      <button aria-checked={entry.enabled}
        aria-label={t(entry.enabled ? 'settings.webLookup.hideMenuItem' : 'settings.webLookup.showMenuItem', { label: entry.label })}
        className={settingsSwitchClassName(entry.enabled)} onClick={() => setEntries(updateWebLookupEntry(entry.id, { enabled: !entry.enabled }))}
        role="switch" type="button">
        <span aria-hidden="true" className={settingsSwitchKnobClassName(entry.enabled)} />
      </button>
    </div>)}
    <AppButton className="mt-4 min-h-11 w-full" onClick={add} type="button">
      <Plus aria-hidden="true" size={16} />{t('settings.webLookup.add')}
    </AppButton>
    <AppDialog open={editing !== null} onOpenChange={open => { if (!open) setEditingId(null); }}>
      {editing ? <WebLookupEntryDialog entry={editing} onClose={() => setEditingId(null)}
        onRemove={() => { setEntries(removeWebLookupEntry(editing.id)); setEditingId(null); }}
        onSave={patch => { setEntries(updateWebLookupEntry(editing.id, patch)); setEditingId(null); }} /> : null}
    </AppDialog>
  </section>;
}

function WebLookupEntryDialog(props: {
  entry: WebLookupEntry;
  onClose(): void;
  onRemove(): void;
  onSave(patch: { label: string; urlTemplate: string }): void;
}) {
  const t = useTranslation();
  const [label, setLabel] = useState(props.entry.label);
  const [urlTemplate, setUrlTemplate] = useState(props.entry.urlTemplate);
  const [invalid, setInvalid] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!label.trim() || !isValidUrlTemplate(urlTemplate.trim())) { setInvalid(true); return; }
    props.onSave({ label: label.trim(), urlTemplate: urlTemplate.trim() });
  }
  return <AppDialogPortal>
    <AppDialogOverlay />
    <AppDialogContent className="max-h-[80dvh] w-[calc(100vw-2rem)] max-w-md overflow-y-auto p-5">
      <AppDialogTitle className="text-base">{t('companion.settings.webLookup.editTitle')}</AppDialogTitle>
      <form className="mt-4 flex flex-col gap-3" onSubmit={submit}>
        <label className="flex flex-col gap-1 text-sm text-companion-text-secondary">
          {t('settings.webLookup.header.menuLabel')}
          <AppInput aria-label={t('settings.webLookup.menuLabelAria', { label: props.entry.label })} className="min-h-11 text-base"
            value={label} onChange={event => { setLabel(event.target.value); setInvalid(false); }} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-companion-text-secondary">
          {t('companion.settings.webLookup.link')}
          <textarea aria-label={t('settings.webLookup.linkAria', { label: props.entry.label })}
            autoCapitalize="off" autoCorrect="off" spellCheck={false}
            className="min-h-24 w-full rounded-md border border-companion-divider bg-background px-3 py-2 text-base text-foreground"
            value={urlTemplate} onChange={event => { setUrlTemplate(event.target.value); setInvalid(false); }} />
        </label>
        {invalid ? <p className="text-sm text-error" role="alert">{t('companion.settings.webLookup.invalid')}</p> : null}
        <AppDialogActions>
          {isRemovable(props.entry) ? <AppButton className="mr-auto min-h-11" onClick={props.onRemove} type="button" variant="ghost">
            <Trash2 aria-hidden="true" size={16} />{t('settings.webLookup.removeTitle')}
          </AppButton> : null}
          <AppButton className="min-h-11" onClick={props.onClose} type="button">{t('common.cancel')}</AppButton>
          <AppButton className="min-h-11" type="submit" variant="emphasis">{t('shared.confirm.confirm')}</AppButton>
        </AppDialogActions>
      </form>
    </AppDialogContent>
  </AppDialogPortal>;
}
