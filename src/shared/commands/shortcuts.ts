import type { CommandShortcut } from './types';

function normalizeShortcutFlag(value: boolean | undefined) {
  return value ?? false;
}

export function matchesShortcut(event: KeyboardEvent, shortcut: CommandShortcut) {
  if (event.key !== shortcut.key) {
    return false;
  }
  return (
    event.altKey === normalizeShortcutFlag(shortcut.altKey) &&
    event.ctrlKey === normalizeShortcutFlag(shortcut.ctrlKey) &&
    event.metaKey === normalizeShortcutFlag(shortcut.metaKey) &&
    event.shiftKey === normalizeShortcutFlag(shortcut.shiftKey)
  );
}
