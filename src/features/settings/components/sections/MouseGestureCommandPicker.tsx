import { ChevronDown, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';

import type { CommandPaletteItem } from '../../../../shared/commands/types';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { onWindowPriorityEscape } from '../../../../shared/platform/keyboard';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
  settingsButtonClassName,
  settingsFieldClassName
} from '../../../../shared/ui';

function matchesCommand(item: CommandPaletteItem, query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  return (
    !normalized ||
    [item.title, item.section, ...(item.keywords ?? [])].some((value) =>
      value?.toLocaleLowerCase().includes(normalized)
    )
  );
}

function CommandPickerContent(props: {
  chooseLabel: string;
  commands: CommandPaletteItem[];
  onChange: (commandId: string | null) => void;
  onQueryChange: (query: string) => void;
  query: string;
  searchRef: RefObject<HTMLInputElement>;
}) {
  const t = useTranslation();
  return (
    <AppDropdownMenuContent
      align="end"
      aria-label={props.chooseLabel}
      className="w-80 max-w-[var(--radix-dropdown-menu-content-available-width)] p-2"
      collisionPadding={12}
    >
      <label className="relative block">
        <Search aria-hidden="true" className="absolute left-2.5 top-2.5 text-muted-foreground" size={16} />
        <input aria-label={t('settings.mouseGestures.bindings.filter')} className={settingsFieldClassName('pl-8')} onChange={(event) => props.onQueryChange(event.target.value)} onKeyDown={(event) => event.stopPropagation()} ref={props.searchRef} value={props.query} />
      </label>
      <div className="app-scrollbar mt-2 max-h-[min(18rem,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto">
        <AppDropdownMenuItem onSelect={() => props.onChange(null)}>
          {t('settings.mouseGestures.bindings.unbound')}
        </AppDropdownMenuItem>
        {props.commands.map((item) => (
          <AppDropdownMenuItem className="justify-between gap-3" key={item.id} onSelect={() => props.onChange(item.id)}>
            <span className="truncate">{item.title}</span>
            {item.section ? <span className="shrink-0 text-ui-xs text-muted-foreground">{item.section}</span> : null}
          </AppDropdownMenuItem>
        ))}
      </div>
    </AppDropdownMenuContent>
  );
}

export function MouseGestureCommandPicker(props: {
  commandId: string | null;
  commands: CommandPaletteItem[];
  gestureLabel: string;
  open: boolean;
  onChange: (commandId: string | null) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslation();
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null!);
  const selected = props.commands.find((item) => item.id === props.commandId);
  const filtered = useMemo(
    () => props.commands.filter((item) => matchesCommand(item, query)),
    [props.commands, query]
  );
  useEffect(() => {
    if (!props.open) return undefined;
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
    const unlistenEscape = onWindowPriorityEscape(() => {
      setQuery('');
      props.onOpenChange(false);
      return true;
    });
    return () => {
      window.cancelAnimationFrame(frame);
      unlistenEscape();
    };
  }, [props.onOpenChange, props.open]);

  const chooseLabel = t('settings.mouseGestures.bindings.choose', { label: props.gestureLabel });
  const changeBinding = (commandId: string | null) => {
    props.onChange(commandId);
    props.onOpenChange(false);
  };
  const changeOpen = (open: boolean) => {
    if (!open) setQuery('');
    props.onOpenChange(open);
  };
  return (
    <AppDropdownMenu onOpenChange={changeOpen} open={props.open}>
      <AppDropdownMenuTrigger asChild>
        <button
          aria-label={chooseLabel}
          className={settingsButtonClassName('w-full min-w-0 justify-between')}
          type="button"
        >
          <span className={selected ? 'truncate' : 'truncate text-foreground/55'}>
            {selected?.title ?? t('settings.mouseGestures.bindings.unbound')}
          </span>
          <ChevronDown aria-hidden="true" className="ml-2 shrink-0 text-muted-foreground" size={15} />
        </button>
      </AppDropdownMenuTrigger>
      <CommandPickerContent chooseLabel={chooseLabel} commands={filtered} onChange={changeBinding} onQueryChange={setQuery} query={query} searchRef={searchRef} />
    </AppDropdownMenu>
  );
}
