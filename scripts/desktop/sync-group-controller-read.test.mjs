import { expect, it, vi } from 'vitest';

import { readSyncGroupControllerState } from './sync-group-controller-read.mjs';

it('retries only the transient database-owner read collision', async () => {
  const action = vi.fn()
    .mockRejectedValueOnce(new Error('sqlite connection is owned by another asynchronous transaction'))
    .mockResolvedValue({ deviceCount: 2 });
  await expect(readSyncGroupControllerState(action, {
    wait: async () => undefined
  })).resolves.toEqual({ deviceCount: 2 });
  expect(action).toHaveBeenCalledTimes(2);
});

it('does not hide other controller failures', async () => {
  await expect(readSyncGroupControllerState(async () => {
    throw new Error('group identity mismatch');
  })).rejects.toThrow('group identity mismatch');
});
