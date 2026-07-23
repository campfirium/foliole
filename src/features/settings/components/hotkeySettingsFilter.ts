import { useMemo } from 'react';

import type { HotkeySettingItem } from '../model/hotkeySettings';

export type HotkeyFilterMode = 'all' | 'assigned' | 'customized' | 'unassigned';

function hotkeyMatchesFilter(item: HotkeySettingItem, filterMode: HotkeyFilterMode) {
  const hasShortcut = Boolean(item.primaryShortcutLabel || item.secondaryShortcutLabel);
  if (filterMode === 'assigned') return hasShortcut;
  if (filterMode === 'customized') return item.isCustomized;
  if (filterMode === 'unassigned') return !hasShortcut;
  return true;
}

function hotkeyMatchesQuery(item: HotkeySettingItem, query: string) {
  const normalizedQuery = query
    .replaceAll('⌘', ' command cmd ')
    .replaceAll('⌥', ' option alt ')
    .replaceAll('⇧', ' shift ')
    .replaceAll('⌃', ' control ctrl ')
    .trim()
    .toLowerCase();
  if (!normalizedQuery) return true;
  const haystack = [item.title, item.commandId, item.section, item.shortcutSummaryLabel]
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');
  const queryTokens = normalizedQuery.split(/[^a-z0-9]+/).filter(Boolean);
  return queryTokens.every((token) => haystack.includes(token));
}

export function useFilteredHotkeyItems(
  items: HotkeySettingItem[],
  filterMode: HotkeyFilterMode,
  query: string,
  targetCommandId: string | null
) {
  return useMemo(() => {
    if (targetCommandId) {
      return items.filter((item) => item.commandId === targetCommandId);
    }
    return items.filter((item) => hotkeyMatchesFilter(item, filterMode) && hotkeyMatchesQuery(item, query));
  }, [filterMode, items, query, targetCommandId]);
}
