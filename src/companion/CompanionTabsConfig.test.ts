import { describe, expect, it } from 'vitest';

import {
  COMPANION_SECONDARY_DESTINATIONS,
  DEFAULT_COMPANION_TAB_CONFIG,
  resolveCompanionTabs
} from './CompanionTabsConfig';

describe('CompanionTabsConfig', () => {
  it('resolves the default companion tabs in the current order', () => {
    expect(resolveCompanionTabs().map((tab) => tab.labelKey)).toEqual([
      'companion.tabs.shortcut.directory',
      'companion.tabs.browse',
      'companion.tabs.learn',
      'companion.tabs.search',
      'companion.tabs.settings'
    ]);
  });

  it('keeps secondary destinations in a registry outside the tab bar', () => {
    expect(COMPANION_SECONDARY_DESTINATIONS.map((destination) => destination.id)).toEqual([
      'directory',
      'onlyReview',
      'sync',
      'tabs',
      'syncActivity',
      'syncConnection',
      'syncHandoff'
    ]);
    expect(DEFAULT_COMPANION_TAB_CONFIG.shortcut).toEqual({
      destinationId: 'directory',
      enabled: true
    });
  });
});
