import type { CommandShortcut, CommandShortcutSet } from './types';

function normalizeShortcutFlag(value: boolean | undefined) {
  return value ?? false;
}

function normalizeShortcutKey(value: string) {
  if (value === ' ') {
    return ' ';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
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

export function formatShortcutSetLabel(shortcuts: CommandShortcutSet | undefined) {
  if (!shortcuts) {
    return '';
  }
  const labels = [shortcuts.primary, shortcuts.secondary].filter(Boolean).map((shortcut) => formatShortcutLabel(shortcut as CommandShortcut));
  return labels.join(' / ');
}

function formatAriaShortcutKey(key: string) {
  const normalized = normalizeShortcutKey(key);
  if (normalized === ' ' || normalized === 'Space') {
    return 'Space';
  }
  return normalized.length === 1 ? normalized.toUpperCase() : normalized;
}

export function formatAriaShortcut(shortcut: CommandShortcut) {
  const parts: string[] = [];
  if (shortcut.ctrlKey) {
    parts.push('Control');
  }
  if (shortcut.metaKey) {
    parts.push('Meta');
  }
  if (shortcut.altKey) {
    parts.push('Alt');
  }
  if (shortcut.shiftKey) {
    parts.push('Shift');
  }
  parts.push(formatAriaShortcutKey(shortcut.key));
  return parts.join('+');
}

export function formatAriaKeyShortcuts(shortcuts: CommandShortcutSet | undefined) {
  if (!shortcuts) {
    return undefined;
  }
  const labels = [shortcuts.primary, shortcuts.secondary].filter(Boolean).map((shortcut) => formatAriaShortcut(shortcut as CommandShortcut));
  return labels.length ? labels.join(' ') : undefined;
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

export function matchesShortcutSet(event: KeyboardEvent, shortcuts: CommandShortcutSet | undefined) {
  if (!shortcuts) {
    return false;
  }
  return [shortcuts.primary, shortcuts.secondary].some((shortcut) => (shortcut ? matchesShortcut(event, shortcut) : false));
}
