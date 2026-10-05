import { beforeEach, expect, it, vi } from 'vitest';

import { syncIdentityPartitionDigest } from '../../../../../lib/core/sync/syncIdentityDigest.js';
import { buildSyncIdentityRestoreSet } from '../../../../../lib/core/sync/syncIdentityRestoreSet.js';

const remote = vi.hoisted(() => ({ fetch: vi.fn(), readPage: vi.fn(),
  create: vi.fn(), close: vi.fn(), initialize: vi.fn(), stage: vi.fn(), count: vi.fn() }));
vi.mock('../../companionDesktopSyncHttp', () => ({ fetchDesktopJson: remote.fetch }));
vi.mock('../../companionWorkspaceRuntimeRepository', () => ({ FolioleCompanionLegacyIdentitySource: {
  createIdentitySourceView: remote.create, closeIdentitySourceView: remote.close
} }));
vi.mock('./syncGroupIdentityCandidateStore', () => ({
  initializeCompanionIdentityCandidates: remote.initialize,
  stageCompanionIdentityCandidates: remote.stage,
  countCompanionIdentityCandidates: remote.count
}));
vi.mock('./syncGroupIdentityRemoteRead', () => ({
  readCompanionRemoteIdentityGlobalPage: remote.readPage
}));

import { probeCompanionSyncIdentityRestoreSet } from './syncGroupIdentityRestoreProbe';

const entry = { object_type: 'node', object_id: 'earlier-on-source',
  fingerprint: 'a'.repeat(64) };
const inventory = { row_count: 1, digest: syncIdentityPartitionDigest([entry]) };
const set = buildSyncIdentityRestoreSet({ restore_id: 'restore-1', group_id: 'group',
  source_peer_id: 'source', target_peer_id: 'receiver',
  source_view_id: '11111111-1111-4111-8111-111111111111',
  source_epoch: 'a'.repeat(32), fact_proof_root: 'b'.repeat(64),
  fact_data_root: 'c'.repeat(64), inventory });
const args = { endpointUrl: 'http://peer', groupId: 'group', localDeviceId: 'receiver',
  peerDeviceId: 'source', restoreId: 'restore-1' };

beforeEach(() => {
  vi.clearAllMocks();
  remote.fetch.mockResolvedValue(set);
  remote.create.mockResolvedValue({ snapshot_path: '/snapshot.db' });
  remote.readPage.mockResolvedValue({ contract: 'global-id-v2',
    source_view_id: set.source_view_id, entries: [entry], nextAfter: null });
  remote.count.mockResolvedValue(1);
});

it('stages an earlier source-only identity from the complete fixed restore set', async () => {
  const staged = await probeCompanionSyncIdentityRestoreSet(args);
  expect(staged.count).toBe(1);
  expect(remote.readPage).toHaveBeenCalledWith(args.endpointUrl,
    set.source_view_id, null, args.restoreId);
  expect(remote.stage).toHaveBeenCalledWith('/snapshot.db', [expect.objectContaining({
    object_id: entry.object_id, kind: 'source_only', source_fingerprint: entry.fingerprint
  })]);
  await staged.cleanup();
  expect(remote.close).toHaveBeenCalledWith({ snapshot_path: '/snapshot.db' });
});

it('rejects an incomplete staged collection and releases its snapshot', async () => {
  remote.count.mockResolvedValue(0);
  await expect(probeCompanionSyncIdentityRestoreSet(args))
    .rejects.toThrow('sync_identity_restore_set_invalid');
  expect(remote.close).toHaveBeenCalledWith({ snapshot_path: '/snapshot.db' });
});
