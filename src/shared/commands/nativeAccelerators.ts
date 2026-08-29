import { usesMacShortcutProjection } from '../platform/runtimeOperatingSystem';

import { getShortcutSetShortcuts } from './shortcuts';
import type { CommandShortcut, CommandShortcutSet } from './types';

const FUNCTION_KEY_PATTERN = /^F(?:[1-9]|1[0-9]|2[0-4])$/;

function hasModifier(shortcut: CommandShortcut) {
  return Boolean(shortcut.altKey || shortcut.ctrlKey || shortcut.metaKey || shortcut.shiftKey);
}

function isFunctionKey(shortcut: CommandShortcut) {
  return FUNCTION_KEY_PATTERN.test(shortcut.key);
}

function isNativeMenuSafe(shortcut: CommandShortcut) {
  return hasModifier(shortcut) || isFunctionKey(shortcut);
}

function getShortcutCandidates(shortcuts: CommandShortcutSet) {
  return getShortcutSetShortcuts(shortcuts);
}

function selectPlatformShortcut(shortcuts: CommandShortcutSet, platform?: string) {
  const candidates = getShortcutCandidates(shortcuts).filter(isNativeMenuSafe);
  if (!candidates.length) {
    return null;
  }
  const preferMeta = usesMacShortcutProjection(platform);
  return candidates.find((shortcut) => Boolean(shortcut.metaKey) === preferMeta) ?? candidates[0] ?? null;
}

function formatAcceleratorKey(key: string) {
  if (key === ' ') {
    return 'Space';
  }
  if (key.startsWith('Arrow')) {
    return key.slice('Arrow'.length);
  }
  return key.length === 1 ? key.toUpperCase() : key;
}

function formatNativeMenuAccelerator(shortcut: CommandShortcut) {
  const parts: string[] = [];
  if (shortcut.metaKey) {
    parts.push('Command');
  }
  if (shortcut.ctrlKey) {
    parts.push('Control');
  }
  if (shortcut.altKey) {
    parts.push('Alt');
  }
  if (shortcut.shiftKey) {
    parts.push('Shift');
  }
  parts.push(formatAcceleratorKey(shortcut.key));
  return parts.join('+');
}

export function resolveNativeMenuAccelerator(shortcuts: CommandShortcutSet | undefined, platform?: string) {
  if (!shortcuts) {
    return '';
  }
  const shortcut = selectPlatformShortcut(shortcuts, platform);
  return shortcut ? formatNativeMenuAccelerator(shortcut) : '';
}

export function resolveNativeAccelerators(shortcuts: CommandShortcutSet | undefined) {
  if (!shortcuts) {
    return [];
  }
  return getShortcutCandidates(shortcuts)
    .filter(isNativeMenuSafe)
    .map(formatNativeMenuAccelerator);
}
