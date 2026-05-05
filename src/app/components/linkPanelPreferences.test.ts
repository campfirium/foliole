import { describe, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';

import {
  getDefaultLinkPanelSize,
  loadLinkPanelSize,
  normalizeLinkPanelSize,
  saveLinkPanelSize
} from './linkPanelPreferences';

describe('linkPanelPreferences', () => {
  it('defaults to a panel that is at least half the viewport width and height', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });

    expect(getDefaultLinkPanelSize()).toEqual({ height: 800, width: 800 });
  });

  it('clamps saved sizes back into the current viewport bounds', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });

    expect(normalizeLinkPanelSize({ height: 1200, width: 2000 })).toEqual({ height: 868, width: 1168 });
    expect(normalizeLinkPanelSize({ height: 100, width: 200 })).toEqual({ height: 450, width: 600 });
  });

  it('loads malformed storage values as the default size', () => {
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.linkPanelSize, '{bad');
    expect(loadLinkPanelSize()).toEqual(getDefaultLinkPanelSize());
  });

  it('saves normalized size through whitelisted storage', () => {
    const spy = vi.spyOn(window.localStorage.__proto__, 'setItem');
    saveLinkPanelSize({ height: 1000, width: 2000 });
    expect(spy).toHaveBeenCalledWith(
      APP_SETTINGS_STORAGE_KEYS.linkPanelSize,
      JSON.stringify(normalizeLinkPanelSize({ height: 1000, width: 2000 }))
    );
  });
});
