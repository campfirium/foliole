import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createDefaultImportManagerSettings } from '../../../lib/core/import/importManagerSettings';
import { useWorkspaceStore } from '../../store/workspaceStore';

const { loadImportSourceWorkspaceSettings, runReadwiseReaderImportInRuntime } = vi.hoisted(() => ({
  loadImportSourceWorkspaceSettings: vi.fn(),
  runReadwiseReaderImportInRuntime: vi.fn()
}));

vi.mock('../components/importSourceWorkspaceSettings', () => ({
  IMPORT_SOURCE_WORKSPACE_SETTINGS_CHANGED_EVENT:
    'foliole:import-source-workspace-settings-changed',
  loadImportSourceWorkspaceSettings
}));

vi.mock('../../shared/platform/readwiseReaderImportRuntimeRepository', () => ({
  runReadwiseReaderImportInRuntime
}));

import { useReadwiseAutoSync } from './useReadwiseAutoSync';

function createEnabledReadwiseSettings() {
  return {
    ...createDefaultImportManagerSettings(),
    readwiseReaderConfig: {
      ...createDefaultImportManagerSettings().readwiseReaderConfig,
      enabled: true,
      validatedAt: '2026-05-11T00:00:00.000Z'
    },
    readwiseRootPath: '/Readwise'
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  loadImportSourceWorkspaceSettings.mockResolvedValue(createEnabledReadwiseSettings());
  runReadwiseReaderImportInRuntime.mockResolvedValue({
    completed_at: '2026-05-11T01:00:00.000Z',
    entry_count: 1,
    failed_count: 0,
    imported_count: 1,
    source_count: 4,
    skipped_count: 0,
    status: 'completed'
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

it('runs Readwise auto sync after the selected interval while the app is open', async () => {
  const rehydrate = vi.spyOn(useWorkspaceStore.persist, 'rehydrate').mockResolvedValue();
  renderHook(() => useReadwiseAutoSync());

  await act(async () => {
    await Promise.resolve();
  });
  expect(loadImportSourceWorkspaceSettings).toHaveBeenCalledTimes(1);
  expect(runReadwiseReaderImportInRuntime).not.toHaveBeenCalled();

  await act(async () => {
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    await Promise.resolve();
  });

  expect(runReadwiseReaderImportInRuntime).toHaveBeenCalledWith(
    expect.objectContaining({ readwiseRootPath: '/Readwise' })
  );
  expect(rehydrate).toHaveBeenCalledTimes(1);
});

it('keeps scheduling Readwise auto sync after a failed run', async () => {
  const rehydrate = vi.spyOn(useWorkspaceStore.persist, 'rehydrate').mockResolvedValue();
  runReadwiseReaderImportInRuntime.mockRejectedValueOnce(new Error('sync failed'));
  renderHook(() => useReadwiseAutoSync());

  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    await Promise.resolve();
  });
  expect(runReadwiseReaderImportInRuntime).toHaveBeenCalledTimes(1);

  runReadwiseReaderImportInRuntime.mockResolvedValueOnce({
    completed_at: '2026-05-11T02:00:00.000Z',
    entry_count: 0,
    failed_count: 0,
    imported_count: 0,
    source_count: 4,
    skipped_count: 0,
    status: 'completed'
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    await Promise.resolve();
  });

  expect(runReadwiseReaderImportInRuntime).toHaveBeenCalledTimes(2);
  expect(rehydrate).not.toHaveBeenCalled();
});
