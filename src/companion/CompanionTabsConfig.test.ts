import { describe, expect, it } from 'vitest';

import {
  COMPANION_SECONDARY_DESTINATIONS,
  DEFAULT_COMPANION_TAB_CONFIG,
  resolveCompanionTabs
} from './CompanionTabsConfig';

describe('CompanionTabsConfig', () => {
  it('resolves the default companion tabs in the current order', () => {
    expect(resolveCompanionTabs().map((tab) => tab.label)).toEqual([
      'Browse',
      'Learn',
      'Search',
      'Settings'
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
    expect(DEFAULT_COMPANION_TAB_CONFIG.shortcut.enabled).toBe(false);
  });
});
