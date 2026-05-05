import type { CommandShortcut } from './types';

function normalizeShortcutFlag(value: boolean | undefined) {
  return value ?? false;
}

function normalizeShortcutKey(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed === ' ') {
    return ' ';
  }
  if (trimmed.length === 1) {
    return trimmed.toLowerCase();
  }

  const aliases: Record<string, string> = {
    cmd: 'Meta',
    command: 'Meta',
    ctrl: 'Ctrl',
    control: 'Ctrl',
    ctl: 'Ctrl',
    option: 'Alt',
    esc: 'Escape',
    spacebar: 'Space',
    space: 'Space',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    up: 'ArrowUp',
    down: 'ArrowDown',
    del: 'Delete',
    return: 'Enter'
  };
  const lowered = trimmed.toLowerCase();
  return aliases[lowered] ?? trimmed;
}

function normalizeKeyForMatch(value: string) {
  const normalized = normalizeShortcutKey(value);
  if (normalized === 'Space') {
    return ' ';
  }
  return normalized;
}

export function matchesShortcut(event: KeyboardEvent, shortcut: CommandShortcut) {
  if (normalizeKeyForMatch(event.key) !== normalizeKeyForMatch(shortcut.key)) {
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
  if (normalizeShortcutKey(shortcut.key) === ' ') {
    parts.push('Space');
  } else {
    const normalizedKey = normalizeShortcutKey(shortcut.key);
    if (normalizedKey === 'Space') {
      parts.push('Space');
    } else {
      parts.push(normalizedKey.length === 1 ? normalizedKey.toUpperCase() : normalizedKey);
    }
  }
  return parts.join('+');
}

export function getShortcutSignature(shortcut: CommandShortcut) {
  return [
    `m:${shortcut.metaKey ? 1 : 0}`,
    `c:${shortcut.ctrlKey ? 1 : 0}`,
    `a:${shortcut.altKey ? 1 : 0}`,
    `s:${shortcut.shiftKey ? 1 : 0}`,
    `k:${normalizeKeyForMatch(shortcut.key)}`
  ].join('|');
}

export function serializeShortcut(shortcut: CommandShortcut) {
  return formatShortcutLabel(shortcut);
}

export function parseShortcutLabel(value: string): CommandShortcut | null {
  const raw = value.trim();
  if (!raw) {
    return null;
  }

  const tokens = raw
    .split('+')
    .map((item) => item.trim())
    .filter(Boolean);
  if (!tokens.length) {
    return null;
  }

  const shortcut: CommandShortcut = { key: '' };
  for (const token of tokens) {
    const normalized = normalizeShortcutKey(token);
    if (!normalized) {
      return null;
    }

    if (normalized === 'Meta') {
      shortcut.metaKey = true;
      continue;
    }
    if (normalized === 'Ctrl') {
      shortcut.ctrlKey = true;
      continue;
    }
    if (normalized === 'Alt') {
      shortcut.altKey = true;
      continue;
    }
    if (normalized === 'Shift') {
      shortcut.shiftKey = true;
      continue;
    }
    if (shortcut.key) {
      return null;
    }
    shortcut.key = normalized === 'Space' ? ' ' : normalized;
  }

  if (!shortcut.key) {
    return null;
  }

  return shortcut;
}
