import { X } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';

import { DiscourseShortcutGrid } from './DiscourseShortcutPicker';

function ValueChip(props: { onRemove: () => void; value: string }) {
  const t = useTranslation();
  return (
    <span className="inline-flex max-w-[18ch] items-center gap-1 rounded-md bg-settings-control-active px-2 py-1 text-sm text-foreground/76">
      <span className="truncate">{props.value}</span>
      <button aria-label={t('desktop.foliolePublish.removeValue', { value: props.value })} className="rounded-full p-0.5 text-foreground/45 hover:bg-foreground/[0.06] hover:text-foreground" onClick={props.onRemove} tabIndex={-1} type="button">
        <X aria-hidden="true" size={12} strokeWidth={2} />
      </button>
    </span>
  );
}

export function FoliolePublishMultipleValueInput(props: {
  onChange: (value: string[]) => void;
  suggestions: string[];
  value: string[];
}) {
  const t = useTranslation();
  const [draft, setDraft] = useState('');
  const commit = () => {
    const additions = draft.split(',').map((value) => value.trim()).filter(Boolean);
    if (additions.length === 0) return;
    props.onChange([...new Set([...props.value, ...additions])]);
    setDraft('');
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' && event.key !== ',') return;
    event.preventDefault();
    commit();
  };
  const selected = new Set(props.value);
  const toggle = (value: string) => props.onChange(selected.has(value) ? props.value.filter((item) => item !== value) : [...props.value, value]);
  return (
    <div className="grid gap-2.5">
      <div className="flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border border-settings-control-border bg-settings-control px-2 py-1 transition-colors hover:border-settings-control-border-hover hover:bg-settings-control-hover focus-within:border-settings-control-border-hover focus-within:bg-settings-control-hover focus-within:ring-1 focus-within:ring-ring">
        {props.value.map((value) => <ValueChip key={value} onRemove={() => toggle(value)} value={value} />)}
        <input
          aria-label={t('desktop.foliolePublish.valuesPlaceholder')}
          className="min-w-24 flex-1 border-0 bg-transparent px-1 py-1 text-ui-md text-foreground outline-none placeholder:text-foreground/42"
          onBlur={commit}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={props.value.length ? '' : t('desktop.foliolePublish.valuesPlaceholder')}
          spellCheck={false}
          value={draft}
        />
      </div>
      <DiscourseShortcutGrid items={props.suggestions.map((value) => ({ id: value, label: value, selected: selected.has(value) }))} onMore={() => undefined} onSelect={(item) => toggle(item.label)} />
    </div>
  );
}
