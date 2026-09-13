import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../shared/platform/databaseBackupRuntimeRepository', () => ({
  compactDatabaseInRuntime: vi.fn(),
  loadDatabaseSpaceStatusFromRuntime: vi.fn()
}));

import {
  compactDatabaseInRuntime,
  loadDatabaseSpaceStatusFromRuntime
} from '../../../shared/platform/databaseBackupRuntimeRepository';

import { compactDatabase, loadDatabaseSpaceStatus } from './databaseCompaction';

beforeEach(() => vi.clearAllMocks());

it('normalizes the database space status bridge payload', async () => {
  vi.mocked(loadDatabaseSpaceStatusFromRuntime).mockResolvedValue({
    database_size_bytes: 1000,
    reclaimable_bytes: 250,
    reclaimable_percent: 25
  });
  await expect(loadDatabaseSpaceStatus()).resolves.toEqual({
    databaseSizeBytes: 1000,
    reclaimableBytes: 250,
    reclaimablePercent: 25
  });
});

it('reports a compact failure without treating it as success', async () => {
  vi.mocked(compactDatabaseInRuntime).mockRejectedValue(new Error('current library is unchanged'));
  await expect(compactDatabase()).resolves.toEqual({
    ok: false,
    errorMessage: 'current library is unchanged'
  });
});
