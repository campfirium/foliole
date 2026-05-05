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

export function formatShortcutLabel(shortcut: CommandShortcut) {
  const parts: string[] = [];
  if (shortcut.metaKey) {
    parts.push('Cmd');
  }
  if (shortcut.ctrlKey) {
    parts.push('Ctrl');
  }
  if (shortcut.altKey) {
    parts.push('Alt');
  }
  if (shortcut.shiftKey) {
    parts.push('Shift');
  }
  if (shortcut.key === ' ') {
    parts.push('Space');
  } else {
    parts.push(shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key);
  }
  return parts.join('+');
}
