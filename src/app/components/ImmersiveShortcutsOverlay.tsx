import { useTranslation } from '../../shared/localization/LocalizationProvider';

import { IMMERSIVE_READING_SHORTCUTS } from './immersiveReadingShortcuts';

export function ImmersiveShortcutsOverlay({ visible }: { visible: boolean }) {
  const t = useTranslation();
  if (!visible) {
    return null;
  }

  return (
    <aside
      aria-label={t('desktop.immersiveShortcuts.aria')}
      aria-live="polite"
      className="pointer-events-none absolute right-4 bottom-4 z-surface-raised w-80 rounded-xl border border-border bg-bg-elevated/95 p-4 shadow-popover backdrop-blur"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">{t('desktop.immersiveShortcuts.eyebrow')}</p>
      <h2 className="mt-2 text-sm font-semibold text-foreground">{t('desktop.immersiveShortcuts.title')}</h2>
      <p className="mt-1 text-xs leading-5 text-foreground/65">{t('desktop.immersiveShortcuts.description')}</p>
      <ul className="mt-3 space-y-2 text-sm text-foreground/88">
        {IMMERSIVE_READING_SHORTCUTS.map((shortcut) => (
          <li aria-keyshortcuts={shortcut.ariaKeyShortcuts} className="flex items-start justify-between gap-3" key={shortcut.key}>
            <span>{t(shortcut.summaryKey)}</span>
            <kbd className="rounded-md border border-border bg-bg-panel px-2 py-1 text-[11px] font-medium text-foreground/70">
              {shortcut.key}
            </kbd>
          </li>
        ))}
      </ul>
    </aside>
  );
}
