import { readFileSync } from 'node:fs';

import { beforeAll, beforeEach, expect, it } from 'vitest';

import { APP_COMMAND_IDS } from '../../../shared/commands/ids';
import { preloadTranslationCatalog } from '../../../shared/localization/translations';

import {
  getWorkspaceRailItemLabel,
  getWorkspaceRailSectionItems,
  resetWorkspaceRailItems
} from './workspaceRailSettings';

beforeAll(async () => {
  await preloadTranslationCatalog('zh-Hans');
});

beforeEach(() => {
  window.localStorage.clear();
});

it('localizes default rail labels from command translations', () => {
  window.localStorage.setItem('foliole-app-language', 'zh-Hans');

  const labels = getWorkspaceRailSectionItems(resetWorkspaceRailItems(), 'top').map(getWorkspaceRailItemLabel);

  expect(labels).toEqual(['导入', '导入剪贴板', '沉浸阅读', '搜索', '命令面板']);
});

it('recovers old persisted command translation keys before showing rail labels', () => {
  window.localStorage.setItem('foliole-app-language', 'zh-Hans');

  expect(getWorkspaceRailItemLabel({
    commandId: APP_COMMAND_IDS.openCommandPalette,
    id: 'user.command-palette',
    labelOverride: 'desktop.command.openCommandPalette',
    order: 0,
    section: 'top',
    source: 'user',
    visible: true
  })).toBe('命令面板');
});

it('recovers old persisted command translation keys stored as command ids', () => {
  window.localStorage.setItem('foliole-app-language', 'zh-Hans');

  expect(getWorkspaceRailItemLabel({
    commandId: 'desktop.command.openCommandPalette',
    id: 'system.command-palette',
    order: 4,
    section: 'top',
    source: 'system',
    visible: true
  })).toBe('命令面板');
});

it('recovers old command translation keys with stored whitespace', () => {
  window.localStorage.setItem('foliole-app-language', 'zh-Hans');

  expect(getWorkspaceRailItemLabel({
    commandId: ' desktop.command.openCommandPalette ',
    id: 'system.command-palette',
    labelOverride: ' desktop.command.openCommandPalette ',
    order: 4,
    section: 'top',
    source: 'system',
    visible: true
  })).toBe('命令面板');
});

it('uses the active UI translator instead of stored language for rail command labels', () => {
  window.localStorage.setItem('foliole-app-language', 'en');

  expect(getWorkspaceRailItemLabel({
    commandId: APP_COMMAND_IDS.openCommandPalette,
    id: 'system.command-palette',
    order: 4,
    section: 'top',
    source: 'system',
    visible: true
  }, (key) => (key === 'desktop.command.openCommandPalette' ? '命令面板' : key))).toBe('命令面板');
});

it('keeps settings rail labels on the shared rail label resolver', () => {
  const source = readFileSync('src/features/settings/components/sections/SettingsRailSection.tsx', 'utf8');

  expect(source).toContain('label={getWorkspaceRailItemLabel(item, t)}');
  expect(source).not.toContain('return item.labelOverride');
});
