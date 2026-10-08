import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ send: vi.fn(), pull: vi.fn(), resources: vi.fn(), resume: vi.fn() }));
const entry = (id: string) => ({ object_type: 'node', global_id: id, shared_state_hash: '1'.repeat(64),
  frontier_fact_ids: [`version-${id}`], required_relation_ids: [], resource_hashes: [],
  review_fact_ids: [], state_fact_ids: [] });

vi.mock('../../../companionWorkspaceRuntimeRepository', () => ({ FolioleCompanionSync: {
  pullFramedSyncObject: mocks.pull,
  readFramedSyncInventory: async () => ({ entries: [entry('local'), entry('remote')], round_id: '8'.repeat(32) })
} }));
vi.mock('../../runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => ({ read: (task: (db: object) => unknown) => task({ query: async () => [] }) })
}));
vi.mock('./companionFramedSyncInventory', () => ({
  readCompanionFramedSyncInventory: async () => ({ entries: [entry('local'), entry('local-only')] })
}));
vi.mock('./companionFramedSyncResourceRound', () => ({ runCompanionFramedSyncResourceRound: mocks.resources }));
vi.mock('./companionFramedSyncPendingPublications', () => ({ resumeCompanionFramedSyncPendingPublications: mocks.resume }));
vi.mock('./companionFramedSyncTransfer', () => ({ sendCompanionFramedSyncObject: mocks.send }));
vi.mock('./companionFramedSyncPeerRoutes', () => ({ rememberCompanionFramedSyncPeerRoute: async () => undefined }));

import { sendCompanionFramedSyncInventoryDifferences } from './companionFramedSyncInventoryRound.js';

it('checks both current scopes in a resource-only round without sending database changes', async () => {
  const request = { endpoint_url: 'http://desktop:43110', receiver_device_id: 'desktop',
    receiver_library_epoch: 'desktop-epoch', sync_group_id: 'group' };
  const resources = { pending: 1, scanned: 3, transferred: 0, unavailable: 0 };
  mocks.resources.mockResolvedValue(resources);
  await expect(sendCompanionFramedSyncInventoryDifferences(request, true)).resolves.toEqual({
    deferredObjects: [], received: [], sent: [], resources
  });
  expect(mocks.send).not.toHaveBeenCalled();
  expect(mocks.pull).not.toHaveBeenCalled();
  expect(mocks.resume).not.toHaveBeenCalled();
  expect(mocks.resources).toHaveBeenCalledWith(request, new Uint8Array(16).fill(0x88),
    new Set(['local', 'local-only', 'remote']));
});
