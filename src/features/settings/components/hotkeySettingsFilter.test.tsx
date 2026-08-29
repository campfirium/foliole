import { renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';

import type { HotkeySettingItem } from '../model/hotkeySettings';

import { useFilteredHotkeyItems } from './hotkeySettingsFilter';

function item(commandId: string, title: string, shortcutSummaryLabel = ''): HotkeySettingItem {
  return {
    commandId,
    isCustomized: false,
    primaryShortcutLabel: shortcutSummaryLabel,
    secondaryShortcutLabel: '',
    section: '工作区',
    shortcutSummaryLabel,
    title
  };
}

const ITEMS = [
  item('workspace.openSettings', '打开设置'),
  item('workspace.openSearch', '打开搜索'),
  item('workspace.toggleSidebar', 'Réduire la barre latérale', '[')
];

function filteredTitles(query: string) {
  const { result } = renderHook(() => useFilteredHotkeyItems(ITEMS, 'all', query, null));
  return result.current.map((entry) => entry.title);
}

it('filters localized hotkey titles with Unicode queries', () => {
  expect(filteredTitles('设置')).toEqual(['打开设置']);
  expect(filteredTitles('réduire')).toEqual(['Réduire la barre latérale']);
});

it('keeps symbol-only shortcut searches selective', () => {
  expect(filteredTitles('[')).toEqual(['Réduire la barre latérale']);
});
