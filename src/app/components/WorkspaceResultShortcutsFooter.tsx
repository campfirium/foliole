import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../shared/platform/storage';

type ShortcutPreference = 'materialHistoryShortcutsCollapsed' | 'searchPaletteShortcutsCollapsed';

interface ShortcutHintProps {
  keys: string[];
  label: string;
}

export function WorkspaceResultShortcutsFooter(props: {
  preference?: ShortcutPreference;
  showLabel: string;
  collapseLabel: string;
  hints: ShortcutHintProps[];
}) {
  const key = props.preference && APP_SETTINGS_STORAGE_KEYS[props.preference];
  const [collapsed, setCollapsed] = useState(() => !key || getWhitelistedLocalStorageItem(key) !== 'false');

  function toggle() {
    setCollapsed(!collapsed);
    if (key) setWhitelistedLocalStorageItem(key, String(!collapsed));
  }

  return (
    <footer className="relative flex min-h-14 shrink-0 items-center justify-center border-t border-[var(--app-floating-divider-color)] px-12 py-2.5 text-xs text-[color:var(--role-floating-text-muted)]">
      {collapsed ? (
        null
      ) : (
        <span className="flex min-w-0 flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-center">
          {props.hints.map((hint) => <ShortcutHint key={hint.keys.join(' ')} {...hint} />)}
        </span>
      )}
      <button
        aria-label={collapsed ? props.showLabel : props.collapseLabel}
        aria-expanded={!collapsed}
        className="absolute right-5 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-sm text-foreground/32 transition-colors hover:text-foreground/58 "
        onClick={toggle}
        type="button"
      >
        {collapsed ? <ChevronUp size={14} strokeWidth={2} /> : <ChevronDown size={14} strokeWidth={2} />}
      </button>
    </footer>
  );
}

function ShortcutHint(props: ShortcutHintProps) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="inline-flex items-center gap-0.5">
        {props.keys.map((key) => (
          <kbd className="font-semibold leading-none text-[color:var(--role-floating-text-muted)]" key={key}>
            {key}
          </kbd>
        ))}
      </span>
      <span>{props.label}</span>
    </span>
  );
}
