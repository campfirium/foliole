import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildDiscoveryPayload: vi.fn(() => ({ group_id: 'group-test' })),
  runWithDatabaseConnectionOwner: vi.fn()
}));

vi.mock('../database/connection.js', () => ({
  runWithDatabaseConnectionOwner: mocks.runWithDatabaseConnectionOwner
}));
vi.mock('./companionLanPayloads.js', () => ({
  buildDiscoveryPayload: mocks.buildDiscoveryPayload
}));

import { loadCompanionLanDiscovery } from './companionLanDiscovery.js';

it('queues discovery behind the active database owner', async () => {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  mocks.runWithDatabaseConnectionOwner.mockImplementationOnce(async (execute: () => unknown) => {
    await wait;
    return execute();
  });

  let settled = false;
  const discovery = loadCompanionLanDiscovery('0.1.0-test')
    .finally(() => { settled = true; });
  await Promise.resolve();
  expect(settled).toBe(false);
  expect(mocks.buildDiscoveryPayload).not.toHaveBeenCalled();

  release();
  await expect(discovery).resolves.toEqual({ group_id: 'group-test' });
  expect(mocks.buildDiscoveryPayload).toHaveBeenCalledWith('0.1.0-test');
});
