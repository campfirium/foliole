import { beforeEach, expect, it, vi } from 'vitest';

import { createDefaultImportManagerSettings } from '../../../lib/core/import/importManagerSettings';

const runtimeSettings = vi.hoisted(() => ({
  hasAppRuntimeCommandRepository: vi.fn(),
  loadImportManagerSettingsFromRuntime: vi.fn(),
  saveImportManagerSettingsToRuntime: vi.fn()
}));

vi.mock('../../shared/platform/appRuntimeCommandRepository', () => runtimeSettings);

import {
  loadImportSourceWorkspaceSettings,
  resetImportSourceWorkspaceSettingsCacheForTest,
  saveImportSourceWorkspaceSettings
} from './importSourceWorkspaceSettings';

beforeEach(() => {
  vi.restoreAllMocks();
  resetImportSourceWorkspaceSettingsCacheForTest();
  runtimeSettings.hasAppRuntimeCommandRepository.mockReturnValue(true);
  runtimeSettings.loadImportManagerSettingsFromRuntime.mockResolvedValue(createDefaultImportManagerSettings());
  runtimeSettings.saveImportManagerSettingsToRuntime.mockImplementation(async (settings) => settings);
});

it('reuses the first import settings load for prewarm and open', async () => {
  const [first, second] = await Promise.all([
    loadImportSourceWorkspaceSettings(),
    loadImportSourceWorkspaceSettings()
  ]);
  const third = await loadImportSourceWorkspaceSettings();

  expect(first).toEqual(second);
  expect(third).toEqual(first);
  expect(runtimeSettings.loadImportManagerSettingsFromRuntime).toHaveBeenCalledTimes(1);
});

it('updates the cached import settings after saving', async () => {
  const saved = {
    ...createDefaultImportManagerSettings(),
    detailsOpen: false
  };
  await saveImportSourceWorkspaceSettings(saved);
  runtimeSettings.loadImportManagerSettingsFromRuntime.mockClear();
  const loaded = await loadImportSourceWorkspaceSettings();

  expect(loaded.detailsOpen).toBe(false);
  expect(runtimeSettings.loadImportManagerSettingsFromRuntime).not.toHaveBeenCalled();
});
