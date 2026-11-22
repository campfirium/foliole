import { beforeEach, describe, expect, it, vi } from 'vitest';

const capacitor = vi.hoisted(() => ({
  getPlatform: vi.fn(() => 'web'),
  isNativePlatform: vi.fn(() => false),
  isPluginAvailable: vi.fn(() => true)
}));

vi.mock('@capacitor/core', () => ({ Capacitor: capacitor, registerPlugin: vi.fn(() => ({})) }));

import { supportsCompanionBackupRestore } from './companionBackupRestoreRuntimeRepository';

describe('supportsCompanionBackupRestore', () => {
  beforeEach(() => {
    capacitor.isNativePlatform.mockReturnValue(true);
    capacitor.isPluginAvailable.mockReturnValue(true);
  });

  it('offers restore on both native companion hosts that ship the plugin', () => {
    for (const platform of ['android', 'ios']) {
      capacitor.getPlatform.mockReturnValue(platform);
      expect(supportsCompanionBackupRestore()).toBe(true);
    }
  });

  it('hides restore without a native host or without the plugin', () => {
    capacitor.getPlatform.mockReturnValue('ios');
    capacitor.isPluginAvailable.mockReturnValue(false);
    expect(supportsCompanionBackupRestore()).toBe(false);
    capacitor.isNativePlatform.mockReturnValue(false);
    capacitor.getPlatform.mockReturnValue('web');
    capacitor.isPluginAvailable.mockReturnValue(true);
    expect(supportsCompanionBackupRestore()).toBe(false);
  });
});
