import { ChevronDown } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { appFloatingSurfaceClassName, appInputFocusVisibleClassName } from '../../shared/ui';

import { DiscourseShortcutGrid, useDiscourseEscapeClose } from './DiscourseShortcutPicker';

function ValuePanel(props: {
  close: () => void;
  field: string;
  onQueryChange: (query: string) => void;
  query: string;
  select: (value: string) => void;
  suggestions: string[];
  value: string;
}) {
  const t = useTranslation();
  const normalizedQuery = props.query.trim().toLowerCase();
  const matches = props.suggestions.filter((value) => value.toLowerCase().includes(normalizedQuery));
  const canCreate = Boolean(props.query.trim() && !props.suggestions.some((value) => value.toLowerCase() === normalizedQuery));
  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-foreground/10 px-5">
      <div className={appFloatingSurfaceClassName('popover', 'grid w-[min(860px,calc(100vw-40px))] gap-3 overflow-hidden p-4')} role="listbox">
        <div className="grid grid-cols-[1fr_auto] items-center gap-3">
          <input aria-label={t('desktop.foliolePublish.chooseValue', { field: props.field })} autoFocus className="h-10 rounded-md border border-settings-control-border bg-settings-control px-3 text-ui-md text-foreground outline-none focus:border-settings-control-border-hover focus:bg-settings-control-hover focus:ring-1 focus:ring-ring" onChange={(event) => props.onQueryChange(event.target.value)} onKeyDown={(event) => {
            if (event.key !== 'Enter' || !props.query.trim()) return;
            event.preventDefault();
            props.select(props.query.trim());
          }} value={props.query} />
          <button className="h-10 rounded-md px-3 text-ui-md text-foreground/62 hover:bg-settings-control-hover hover:text-foreground" onClick={props.close} type="button">{t('common.cancel')}</button>
        </div>
        <div className="app-scrollbar grid max-h-[min(420px,calc(100vh-180px))] grid-cols-2 gap-2 overflow-y-auto">
          {canCreate ? <button className="rounded-md px-3 py-2 text-left text-ui-md text-foreground hover:bg-foreground/[0.04]" onClick={() => props.select(props.query.trim())} role="option" type="button">{t('desktop.foliolePublish.useValue', { value: props.query.trim() })}</button> : null}
          {matches.map((value) => <button aria-selected={value === props.value} className="rounded-md px-3 py-2 text-left text-ui-md text-foreground hover:bg-foreground/[0.04] aria-selected:bg-foreground/[0.075]" key={value} onClick={() => props.select(value)} role="option" type="button">{value}</button>)}
        </div>
      </div>
    </div>
  );
}

export function FoliolePublishSingleValuePicker(props: {
  field: string;
  onChange: (value: string) => void;
  suggestions: string[];
  value: string;
}) {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const close = () => {
    setOpen(false);
    setQuery('');
  };
  useDiscourseEscapeClose(open, close);
  const select = (value: string) => {
    props.onChange(value);
    close();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const shortcut = Number(event.key);
    const suggestion = props.suggestions[shortcut - 1];
    if (shortcut >= 1 && shortcut <= 9 && suggestion) {
      event.preventDefault();
      select(suggestion);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
    }
  };
  return (
    <div className="relative grid gap-2.5">
      <button aria-expanded={open} aria-haspopup="listbox" aria-label={t('desktop.foliolePublish.chooseValue', { field: props.field })} className={`flex h-10 w-full items-center justify-between rounded-md border border-settings-control-border bg-settings-control px-3 text-left text-ui-md text-foreground transition-colors hover:border-settings-control-border-hover hover:bg-settings-control-hover ${appInputFocusVisibleClassName}`} onClick={() => setOpen(true)} onKeyDown={handleKeyDown} type="button">
        <span className="min-w-0 truncate">{props.value || t('desktop.foliolePublish.valuePlaceholder')}</span>
        <ChevronDown aria-hidden="true" className="ml-2 shrink-0 text-foreground/55" size={15} strokeWidth={2} />
      </button>
      <DiscourseShortcutGrid items={props.suggestions.map((value) => ({ id: value, label: value, selected: value === props.value }))} onMore={() => setOpen(true)} onSelect={(item) => select(item.label)} />
      {open ? <ValuePanel close={close} field={props.field} onQueryChange={setQuery} query={query} select={select} suggestions={props.suggestions} value={props.value} /> : null}
    </div>
  );
}
