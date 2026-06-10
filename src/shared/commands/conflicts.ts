import { formatShortcutLabel, getShortcutSignature } from './shortcuts';
import type { CommandShortcut } from './types';

type ShortcutConflictSeverity = 'warning' | 'error';

export interface ShortcutConflictEntry {
  commandId: string;
  title: string;
  section?: string;
  scope: string;
  shortcut?: CommandShortcut;
}

export interface CommandShortcutConflictState {
  severity?: ShortcutConflictSeverity;
  message?: string;
}

function resolveSeverity(entries: ShortcutConflictEntry[]): ShortcutConflictSeverity {
  const scopes = new Set(entries.map((entry) => entry.scope));
  return scopes.size < entries.length ? 'error' : 'warning';
}

function pushConflict(
  map: Record<string, CommandShortcutConflictState>,
  commandId: string,
  severity: ShortcutConflictSeverity,
  message: string
) {
  const previous = map[commandId];
  if (!previous || (previous.severity === 'warning' && severity === 'error')) {
    map[commandId] = { severity, message };
  }
}

export function buildCommandShortcutConflictMap(entries: ShortcutConflictEntry[]): Record<string, CommandShortcutConflictState> {
  const byShortcut = new Map<string, ShortcutConflictEntry[]>();

  for (const entry of entries) {
    if (!entry.shortcut) {
      continue;
    }
    const signature = getShortcutSignature(entry.shortcut);
    const group = byShortcut.get(signature);
    if (group) {
      group.push(entry);
      continue;
    }
    byShortcut.set(signature, [entry]);
  }

  const result: Record<string, CommandShortcutConflictState> = {};
  for (const grouped of byShortcut.values()) {
    if (grouped.length <= 1) {
      continue;
    }

    const severity = resolveSeverity(grouped);
    const firstConflict = grouped[0];
    if (!firstConflict) {
      continue;
    }
    const label = formatShortcutLabel(firstConflict.shortcut as CommandShortcut);

    for (const current of grouped) {
      const conflictsWith = grouped
        .filter((item) => item.commandId !== current.commandId)
        .map((item) => item.title)
        .join(', ');
      const message =
        severity === 'error'
          ? `${label} conflicts in same scope with: ${conflictsWith}`
          : `${label} duplicates across scopes with: ${conflictsWith}`;
      pushConflict(result, current.commandId, severity, message);
    }
  }

  return result;
}
