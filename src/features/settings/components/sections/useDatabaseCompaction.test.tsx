import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../model/databaseCompaction', () => ({
  compactDatabase: vi.fn(),
  loadDatabaseSpaceStatus: vi.fn()
}));

import { compactDatabase, loadDatabaseSpaceStatus } from '../../model/databaseCompaction';

import { useDatabaseCompaction } from './useDatabaseCompaction';

beforeEach(() => {
  vi.mocked(compactDatabase).mockReset().mockResolvedValue({ ok: true });
  vi.mocked(loadDatabaseSpaceStatus).mockReset()
    .mockResolvedValueOnce({ databaseSizeBytes: 1000, reclaimableBytes: 250, reclaimablePercent: 25 })
    .mockResolvedValueOnce({ databaseSizeBytes: 750, reclaimableBytes: 0, reclaimablePercent: 0 });
});

it('compacts only on explicit action and refreshes database status', async () => {
  const { result } = renderHook(() => useDatabaseCompaction(true));
  await waitFor(() => expect(result.current.status?.reclaimableBytes).toBe(250));
  expect(compactDatabase).not.toHaveBeenCalled();

  await act(async () => result.current.compact());

  expect(compactDatabase).toHaveBeenCalledTimes(1);
  expect(loadDatabaseSpaceStatus).toHaveBeenCalledTimes(2);
  expect(result.current.status).toEqual({
    databaseSizeBytes: 750,
    reclaimableBytes: 0,
    reclaimablePercent: 0
  });
  expect(result.current.statusMessage).toBe('success');
});
