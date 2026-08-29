import { formatShortcutLabel, getShortcutSetShortcuts, getShortcutSignature } from './shortcuts';
import type { CommandShortcut, CommandShortcutSet } from './types';

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

const MODIFIER_KEYS = ['altKey', 'ctrlKey', 'metaKey', 'shiftKey'] as const;

function hasSameShortcutKey(first: CommandShortcut, second: CommandShortcut) {
  return getShortcutSignature({ key: first.key }) === getShortcutSignature({ key: second.key });
}

function systemShortcutConsumesCandidate(systemShortcut: CommandShortcut, candidate: CommandShortcut) {
  return hasSameShortcutKey(systemShortcut, candidate) && MODIFIER_KEYS.every(
    (key) => !systemShortcut[key] || Boolean(candidate[key])
  );
}

export function findSystemGlobalShortcutConflict(args: {
  candidate: CommandShortcut;
  commandId: string;
  systemGlobalCommandId: string;
  shortcutMap: Record<string, CommandShortcutSet | undefined>;
}) {
  if (args.commandId === args.systemGlobalCommandId) {
    for (const [commandId, shortcutSet] of Object.entries(args.shortcutMap)) {
      if (commandId === args.systemGlobalCommandId) continue;
      if (getShortcutSetShortcuts(shortcutSet).some((shortcut) =>
        systemShortcutConsumesCandidate(args.candidate, shortcut)
      )) return commandId;
    }
    return null;
  }
  return getShortcutSetShortcuts(args.shortcutMap[args.systemGlobalCommandId]).some((shortcut) =>
    systemShortcutConsumesCandidate(shortcut, args.candidate)
  ) ? args.systemGlobalCommandId : null;
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
