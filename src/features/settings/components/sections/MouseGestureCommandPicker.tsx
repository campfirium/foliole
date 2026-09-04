import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { CommandPaletteItem } from '../../../../shared/commands/types';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  settingsButtonClassName,
  settingsFieldClassName,
  settingsPopoverSurfaceClassName,
  settingsSelectableOptionClassName
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

export function MouseGestureCommandPicker(props: {
  commandId: string | null;
  commands: CommandPaletteItem[];
  gestureLabel: string;
  onChange: (commandId: string | null) => void;
}) {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = props.commands.find((item) => item.id === props.commandId);
  const filtered = useMemo(
    () => props.commands.filter((item) => matchesCommand(item, query)),
    [props.commands, query]
  );

  return (
    <div className="relative min-w-0 flex-1">
      <button
        aria-expanded={open}
        aria-label={t('settings.mouseGestures.bindings.choose', { label: props.gestureLabel })}
        className={settingsButtonClassName('w-full justify-between')}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className={selected ? 'truncate' : 'truncate text-foreground/55'}>
          {selected?.title ?? t('settings.mouseGestures.bindings.unbound')}
        </span>
      </button>
      {open ? (
        <CommandPickerMenu
          commandId={props.commandId}
          commands={filtered}
          onChange={(commandId) => {
            props.onChange(commandId);
            setOpen(false);
          }}
          onQueryChange={setQuery}
          query={query}
        />
      ) : null}
    </div>
  );
}

function CommandPickerMenu(props: {
  commandId: string | null;
  commands: CommandPaletteItem[];
  onChange: (commandId: string | null) => void;
  onQueryChange: (query: string) => void;
  query: string;
}) {
  const t = useTranslation();
  return (
    <div className={settingsPopoverSurfaceClassName('shell', 'absolute right-0 top-10 z-popover w-full min-w-72 p-2')}>
      <label className="relative block">
        <Search aria-hidden="true" className="absolute left-2.5 top-2.5 text-muted-foreground" size={16} />
        <input
          aria-label={t('settings.mouseGestures.bindings.filter')}
          autoFocus
          className={settingsFieldClassName('pl-8')}
          onChange={(event) => props.onQueryChange(event.target.value)}
          value={props.query}
        />
      </label>
      <div className="app-scrollbar mt-2 max-h-56 overflow-auto">
        <button
          className={settingsSelectableOptionClassName(!props.commandId, 'flex w-full items-center justify-between px-2 py-1.5 text-left')}
          onClick={() => props.onChange(null)}
          type="button"
        >
          {t('settings.mouseGestures.bindings.unbound')}
        </button>
        {props.commands.map((item) => (
          <button
            className={settingsSelectableOptionClassName(item.id === props.commandId, 'flex w-full items-center justify-between gap-3 px-2 py-1.5 text-left')}
            key={item.id}
            onClick={() => props.onChange(item.id)}
            type="button"
          >
            <span className="truncate">{item.title}</span>
            {item.section ? <span className="text-ui-xs text-muted-foreground">{item.section}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
