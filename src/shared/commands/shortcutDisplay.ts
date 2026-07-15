import { formatShortcutLabel, getShortcutSetShortcuts, parseShortcutLabel } from './shortcuts';
import type { CommandShortcut, CommandShortcutSet, CommandShortcutSlot } from './types';

const SHORTCUT_SET_SLOTS: CommandShortcutSlot[] = ['primary', 'secondary', 'tertiary'];
const MAC_KEY_SEPARATOR = ' ';

export interface ShortcutDisplayEntry {
  label: string;
  slot: CommandShortcutSlot;
}

function resolvePlatformText() {
  if (typeof navigator === 'undefined') {
    return '';
  }
  return `${navigator.platform} ${navigator.userAgent}`.toLowerCase();
}

function isMacPlatform(platform = resolvePlatformText()) {
  return platform.toLowerCase().includes('mac');
}

const MAC_KEY_SYMBOLS: Record<string, string> = {
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  Delete: '⌫',
  Enter: '↩',
  Escape: '⎋',
  ' ': 'Space'
};

function formatMacShortcutLabel(shortcut: CommandShortcut) {
  const parts: string[] = [];
  if (shortcut.ctrlKey) parts.push('⌃');
  if (shortcut.altKey) parts.push('⌥');
  if (shortcut.shiftKey) parts.push('⇧');
  if (shortcut.metaKey) parts.push('⌘');
  parts.push(MAC_KEY_SYMBOLS[shortcut.key] ?? (shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key));
  return parts.join(MAC_KEY_SEPARATOR);
}

function formatShortcutDisplayLabel(shortcut: CommandShortcut, platform?: string) {
  return isMacPlatform(platform) ? formatMacShortcutLabel(shortcut) : formatShortcutLabel(shortcut);
}

export function formatSerializedShortcutDisplayLabel(label: string, platform?: string) {
  const shortcut = parseShortcutLabel(label);
  return shortcut ? formatShortcutDisplayLabel(shortcut, platform) : label;
}

export function formatShortcutSetSearchLabel(shortcuts: CommandShortcutSet | undefined) {
  return getShortcutSetShortcuts(shortcuts)
    .map((shortcut) => {
      const aliases = [formatShortcutLabel(shortcut)];
      if (shortcut.ctrlKey) aliases.push('Control Ctrl');
      if (shortcut.altKey) aliases.push('Option Alt');
      if (shortcut.shiftKey) aliases.push('Shift');
      if (shortcut.metaKey) aliases.push('Command Cmd Meta');
      return aliases.join(' ');
    })
    .join(' / ');
}

function shortcutMatchesPlatform(shortcut: CommandShortcut, platform?: string) {
  const isMac = isMacPlatform(platform);
  if (isMac) {
    return !shortcut.ctrlKey || Boolean(shortcut.metaKey);
  }
  return !shortcut.metaKey;
}

function sameShortcutBase(left: CommandShortcut, right: CommandShortcut) {
  return (
    left.key === right.key &&
    Boolean(left.altKey) === Boolean(right.altKey) &&
    Boolean(left.shiftKey) === Boolean(right.shiftKey)
  );
}

function isCtrlCmdPair(left: CommandShortcut, right: CommandShortcut) {
  const leftCtrlOnly = Boolean(left.ctrlKey) && !left.metaKey;
  const leftMetaOnly = Boolean(left.metaKey) && !left.ctrlKey;
  const rightCtrlOnly = Boolean(right.ctrlKey) && !right.metaKey;
  const rightMetaOnly = Boolean(right.metaKey) && !right.ctrlKey;
  return sameShortcutBase(left, right) && ((leftCtrlOnly && rightMetaOnly) || (leftMetaOnly && rightCtrlOnly));
}

function shortcutForPlatform(left: CommandShortcut, right: CommandShortcut, platform?: string) {
  const preferMeta = isMacPlatform(platform);
  if (preferMeta) {
    return left.metaKey ? left : right;
  }
  return left.ctrlKey ? left : right;
}

export function formatShortcutSetDisplayEntries(
  shortcuts: CommandShortcutSet | undefined,
  platform?: string
): ShortcutDisplayEntry[] {
  const entries = SHORTCUT_SET_SLOTS
    .map((slot) => {
      const shortcut = shortcuts?.[slot];
      return shortcut ? { shortcut, slot } : null;
    })
    .filter((entry): entry is { shortcut: CommandShortcut; slot: CommandShortcutSlot } => Boolean(entry));
  const hiddenSlots = new Set<CommandShortcutSlot>();

  for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
      const left = entries[leftIndex]!;
      const right = entries[rightIndex]!;
      if (!isCtrlCmdPair(left.shortcut, right.shortcut)) {
        continue;
      }
      const visibleShortcut = shortcutForPlatform(left.shortcut, right.shortcut, platform);
      hiddenSlots.add(visibleShortcut === left.shortcut ? right.slot : left.slot);
    }
  }

  return entries
    .filter((entry) => shortcutMatchesPlatform(entry.shortcut, platform))
    .filter((entry) => !hiddenSlots.has(entry.slot))
    .map((entry) => ({ label: formatShortcutDisplayLabel(entry.shortcut, platform), slot: entry.slot }));
}

export function formatShortcutSetDisplayLabel(shortcuts: CommandShortcutSet | undefined, platform?: string) {
  return formatShortcutSetDisplayEntries(shortcuts, platform)
    .map((entry) => entry.label)
    .join(' / ');
}
