import { expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ identity: vi.fn() }));
vi.mock('./companion/sync/syncGroupIdentityCompanionResult', () => ({
  syncCompanionIdentityObjects: runtime.identity
}));

import { syncCompanionObjectsFromDesktop } from './companionDesktopSyncObjects';

it('routes a v21 production sync through the identity round', async () => {
  runtime.identity.mockResolvedValue({ remainingStructureChangeCount: 0 });
  const options = { runId: 'run-1' };

  await expect(syncCompanionObjectsFromDesktop('http://peer', options))
    .resolves.toMatchObject({ remainingStructureChangeCount: 0 });
  expect(runtime.identity).toHaveBeenCalledWith('http://peer', options);
});
