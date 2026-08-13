// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../src/shared/config/appSettings.js';

const settings = vi.hoisted(() => ({
  load: vi.fn(), save: vi.fn()
}));

vi.mock('../database/settingsStore.js', () => ({
  loadJsonSetting: settings.load,
  saveJsonSetting: settings.save
}));

import {
  loadDesktopCompanionSyncParticipation,
  setDesktopCompanionSyncEnabled,
  setDesktopCompanionSyncPaused
} from './desktopCompanionSyncPreference.js';

beforeEach(() => {
  vi.clearAllMocks();
  settings.load.mockReturnValue({
    [APP_SETTINGS_STORAGE_KEYS.desktopDeviceSyncEnabled]: 'true',
    [APP_SETTINGS_STORAGE_KEYS.desktopDeviceSyncPaused]: 'false',
    unrelated: 'preserved'
  });
});

it('hydrates independent permanent Sync and Pause state', () => {
  expect(loadDesktopCompanionSyncParticipation()).toEqual({
    lifecycle_active: true,
    participating: true,
    sync_enabled: true,
    sync_paused: false
  });
});

it('persists one participation choice without rewriting the other', () => {
  setDesktopCompanionSyncPaused(true);
  expect(settings.save).toHaveBeenCalledWith('app_settings', expect.objectContaining({
    [APP_SETTINGS_STORAGE_KEYS.desktopDeviceSyncEnabled]: 'true',
    [APP_SETTINGS_STORAGE_KEYS.desktopDeviceSyncPaused]: 'true',
    unrelated: 'preserved'
  }));

  setDesktopCompanionSyncEnabled(false);
  expect(settings.save).toHaveBeenLastCalledWith('app_settings', expect.objectContaining({
    [APP_SETTINGS_STORAGE_KEYS.desktopDeviceSyncEnabled]: 'false',
    [APP_SETTINGS_STORAGE_KEYS.desktopDeviceSyncPaused]: 'false'
  }));
});
