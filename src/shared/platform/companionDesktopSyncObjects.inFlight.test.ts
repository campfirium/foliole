import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ sync: vi.fn() }));
vi.mock('./companion/sync/syncGroupIdentityCompanionResult', () => ({
  syncCompanionIdentityObjects: runtime.sync
}));

import { syncCompanionObjectsFromDesktop } from './companionDesktopSyncObjects';

beforeEach(() => vi.resetAllMocks());

it('reuses an in-flight sync for repeated requests to the same endpoint', async () => {
  let complete!: (value: { appliedObjectIds: string[] }) => void;
  runtime.sync.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
  const first = syncCompanionObjectsFromDesktop('http://peer.test');
  expect(syncCompanionObjectsFromDesktop('http://peer.test')).toBe(first);
  expect(runtime.sync).toHaveBeenCalledOnce();
  complete({ appliedObjectIds: [] });
  await expect(first).resolves.toMatchObject({ appliedObjectIds: [] });
  runtime.sync.mockResolvedValueOnce({ appliedObjectIds: ['later'] });
  await expect(syncCompanionObjectsFromDesktop('http://peer.test'))
    .resolves.toMatchObject({ appliedObjectIds: ['later'] });
  expect(runtime.sync).toHaveBeenCalledTimes(2);
});

it('allows a fresh request after an identity exchange fails', async () => {
  runtime.sync.mockRejectedValueOnce(new Error('connection_lost'));
  await expect(syncCompanionObjectsFromDesktop('http://retry.test')).rejects.toThrow('connection_lost');
  runtime.sync.mockResolvedValueOnce({ appliedObjectIds: [] });
  await expect(syncCompanionObjectsFromDesktop('http://retry.test'))
    .resolves.toMatchObject({ appliedObjectIds: [] });
  expect(runtime.sync).toHaveBeenCalledTimes(2);
});
