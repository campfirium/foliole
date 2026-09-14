import { describe, expect, it } from 'vitest';

import {
  displaySyncGroupPlatform,
  isDesktopSyncGroupPlatform,
  normalizeDesktopSyncGroupPlatform,
  resolveDesktopSyncGroupPlatform
} from './syncGroupPlatform.js';

describe('Sync Group platform names', () => {
  it('keeps internal platform values out of user-facing copy', () => {
    expect(displaySyncGroupPlatform('win32')).toBe('Windows');
    expect(displaySyncGroupPlatform('Windows 11')).toBe('Windows 11');
    expect(displaySyncGroupPlatform('ios-capacitor')).toBe('iOS');
  });

  it('uses the Windows kernel build only when it identifies Windows 11', () => {
    expect(resolveDesktopSyncGroupPlatform('win32', '10.0.26100')).toBe('Windows 11');
    expect(resolveDesktopSyncGroupPlatform('win32', '10.0.19045')).toBe('Windows');
    expect(resolveDesktopSyncGroupPlatform('win32', 'unknown')).toBe('Windows');
  });

  it('accepts readable Windows names wherever a desktop kind is required', () => {
    expect(isDesktopSyncGroupPlatform('Windows 11')).toBe(true);
    expect(normalizeDesktopSyncGroupPlatform('Windows 11')).toBe('win32');
    expect(isDesktopSyncGroupPlatform('ios-capacitor')).toBe(false);
  });
});
