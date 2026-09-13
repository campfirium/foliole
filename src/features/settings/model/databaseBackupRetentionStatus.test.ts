import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../shared/platform/settingsRuntimeRepository', () => ({
  hasSettingsRuntimeRepository: vi.fn(),
  loadBackupRetentionStatusFromRuntime: vi.fn()
}));

import {
  hasSettingsRuntimeRepository,
  loadBackupRetentionStatusFromRuntime
} from '../../../shared/platform/settingsRuntimeRepository';

import { loadBackupRetentionStatus } from './databaseBackupRetentionStatus';

beforeEach(() => {
  vi.mocked(hasSettingsRuntimeRepository).mockReturnValue(true);
});

it('normalizes the retention status returned by the desktop bridge', async () => {
  vi.mocked(loadBackupRetentionStatusFromRuntime).mockResolvedValue({
    counts: { hourly: 4, daily: 2, weekly: 1, monthly: 0 },
    lastCleanup: { failedCount: 1, movedToTrashCount: 3, remainingBytesOverLimit: 512 },
    safetyCount: 2,
    totalSizeBytes: 2048
  });

  await expect(loadBackupRetentionStatus()).resolves.toEqual({
    counts: { hourly: 4, daily: 2, weekly: 1, monthly: 0 },
    lastCleanup: { failedCount: 1, movedToTrashCount: 3, remainingBytesOverLimit: 512 },
    safetyCount: 2,
    totalSizeBytes: 2048
  });
});

it('returns an empty status for malformed bridge payloads', async () => {
  vi.mocked(loadBackupRetentionStatusFromRuntime).mockResolvedValue({ counts: null });

  await expect(loadBackupRetentionStatus()).resolves.toEqual({
    counts: { hourly: 0, daily: 0, weekly: 0, monthly: 0 },
    lastCleanup: null,
    safetyCount: 0,
    totalSizeBytes: 0
  });
});
