import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';

import { loadSearchPaletteShortcutsCollapsed, saveSearchPaletteShortcutsCollapsed } from './searchPaletteShortcutsPreference';

export function useSearchPaletteShortcuts() {
  const [collapsed, setCollapsed] = useState(loadSearchPaletteShortcutsCollapsed);

  return {
    collapsed,
    toggle: () => {
      const nextCollapsed = !collapsed;
      setCollapsed(nextCollapsed);
      saveSearchPaletteShortcutsCollapsed(nextCollapsed);
    }
  };
}

export function SearchPaletteShortcutsFooter(props: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const t = useTranslation();
  return (
    <footer className="relative flex min-h-11 items-center justify-center px-12 py-2.5 text-[11px] text-foreground/45">
      {props.collapsed ? (
        null
      ) : (
        <span className="flex min-w-0 flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-center">
          <ShortcutHint keys={['Enter']} label={t('desktop.search.shortcuts.open')} />
          <ShortcutHint keys={['Shift', 'Enter']} label={t('desktop.search.shortcuts.preview')} />
          <ShortcutHint keys={['Shift', 'Click']} label={t('desktop.search.shortcuts.preview')} />
        </span>
      )}
      <button
        aria-label={props.collapsed ? t('desktop.search.shortcuts.show') : t('desktop.search.shortcuts.collapse')}
        className="absolute right-5 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-sm text-foreground/32 transition-colors hover:text-foreground/58 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onClick={props.onToggle}
        type="button"
      >
        {props.collapsed ? <ChevronUp size={14} strokeWidth={2} /> : <ChevronDown size={14} strokeWidth={2} />}
      </button>
    </footer>
  );
}

function ShortcutHint(props: {
  keys: string[];
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="inline-flex items-center gap-0.5">
        {props.keys.map((key) => (
          <kbd className="font-semibold leading-none text-foreground/55" key={key}>
            {key}
          </kbd>
        ))}
      </span>
      <span>{props.label}</span>
    </span>
  );
}
