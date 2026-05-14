import { IMMERSIVE_READING_SHORTCUTS } from './immersiveReadingShortcuts';

export function ImmersiveShortcutsOverlay({ visible }: { visible: boolean }) {
  if (!visible) {
    return null;
  }

  return (
    <aside
      aria-label="Immersive reading shortcuts"
      className="pointer-events-none absolute right-4 bottom-4 z-surface-raised w-80 rounded-xl border border-border bg-bg-elevated/95 p-4 shadow-popover backdrop-blur"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">Recommended Now</p>
      <h2 className="mt-2 text-sm font-semibold text-foreground">Immersive Reading</h2>
      <p className="mt-1 text-xs leading-5 text-foreground/65">These shortcuts are shown for the current non-editing reading mode.</p>
      <ul className="mt-3 space-y-2 text-sm text-foreground/88">
        {IMMERSIVE_READING_SHORTCUTS.map((shortcut) => (
          <li className="flex items-start justify-between gap-3" key={shortcut.key}>
            <span>{shortcut.summary}</span>
            <kbd className="rounded-md border border-border bg-bg-panel px-2 py-1 text-[11px] font-medium text-foreground/70">
              {shortcut.key}
            </kbd>
          </li>
        ))}
      </ul>
    </aside>
  );
}
