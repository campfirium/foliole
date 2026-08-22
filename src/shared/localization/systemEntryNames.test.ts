import { describe, expect, it } from 'vitest';

import { APP_LOCALES } from '../../../lib/core/localization/appLocaleRegistry';

import { SYSTEM_ENTRY_LOCALIZATION_CONTRACT } from './systemEntryLocalizationContract';
import { defaultSystemEntryDisplayName, resolveNodeDisplayTitle, SYSTEM_ENTRY_IDS } from './systemEntryNames';
import { preloadTranslationCatalog, translate } from './translations';

const FIXED_NAVIGATION_KEYS = {
  desktop: ['settings.rail.item.import', 'settings.rail.item.importClipboard', 'settings.rail.item.readingMode', 'desktop.command.openWorkspaceSearch', 'desktop.command.openCommandPalette', 'settings.rail.item.feedback', 'settings.rail.item.appearanceMode', 'settings.rail.item.study', 'settings.rail.item.settings'],
  demo: ['desktop.workspace.demo.language', 'desktop.workspace.demo.home', 'desktop.workspace.demo.downloadApp', 'settings.rail.item.feedback', 'desktop.workspace.demo.reset'],
  tabs: ['companion.tabs.browse', 'companion.tabs.learn', 'companion.tabs.search', 'companion.tabs.settings'],
  shortcuts: ['companion.tabs.shortcut.directory', 'companion.tabs.shortcut.onlyReview', 'companion.tabs.shortcut.sync', 'companion.tabs.shortcut.tabs', 'companion.tabs.shortcut.syncActivity', 'companion.tabs.shortcut.syncConnection', 'companion.tabs.shortcut.syncHandoff'],
  groups: ['companion.directory.section.workspace', 'companion.directory.section.external', 'companion.directory.section.virtual', 'companion.directory.section.trash']
} as const;

describe('system entry display names', () => {
  it('provides all seven approved defaults for every formal locale', () => {
    expect(APP_LOCALES).toHaveLength(12);
    for (const locale of APP_LOCALES) {
      expect(SYSTEM_ENTRY_IDS.map((id) => defaultSystemEntryDisplayName(locale, id)))
        .toEqual(SYSTEM_ENTRY_LOCALIZATION_CONTRACT[locale].system);
    }
  });

  it('matches every approved fixed navigation label in every formal locale', async () => {
    const mismatches: string[] = [];
    for (const locale of APP_LOCALES) {
      await preloadTranslationCatalog(locale);
      for (const [surface, keys] of Object.entries(FIXED_NAVIGATION_KEYS)) {
        const expected = SYSTEM_ENTRY_LOCALIZATION_CONTRACT[locale][surface as keyof typeof FIXED_NAVIGATION_KEYS];
        keys.forEach((key, index) => {
          const actual = translate(locale, key);
          if (actual !== expected[index]) mismatches.push(`${locale} ${key}: ${actual} != ${expected[index]}`);
        });
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('uses stable identity instead of a legacy stored title', () => {
    expect(resolveNodeDisplayTitle('zh-Hans', 'special-inbox', 'Legacy Inbox')).toBe('收件箱');
    expect(resolveNodeDisplayTitle('de', 'special-virtual-root', 'Virtual')).toBe('Virtuelle Ordner');
    expect(resolveNodeDisplayTitle('fr', 'user-folder', 'Projects')).toBe('Projects');
  });
});
