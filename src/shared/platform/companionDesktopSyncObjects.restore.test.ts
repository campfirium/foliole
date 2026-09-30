import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  apply: vi.fn(), save: vi.fn(), position: vi.fn(), push: vi.fn()
}));
vi.mock('./companionSyncObjects', () => ({
  applyCompanionDesktopSyncPack: runtime.apply,
  loadCompanionSyncPackPosition: runtime.position,
  loadCompanionSyncPackRestorePosition: runtime.position,
  saveCompanionSyncPackCursor: runtime.save
}));
vi.mock('./companionDesktopSyncPush', () => ({ pushLocalDirtyObjects: runtime.push }));
vi.mock('./companion/network/signedRequest', () => ({
  createSignedRequestHeaders: vi.fn(async () => ({}))
}));
vi.mock('./companion/network/syncGroupPeerIdentity', () => ({
  resolveCompanionSyncPeerId: vi.fn(async () => 'source'),
  resolveCompanionSyncPeerHostName: vi.fn(async () => 'Source')
}));
vi.mock('./companionDesktopSyncResourceStages', () => ({
  createEmptyResourceStages: vi.fn(() => ({})),
  createSkippedResourceSummary: vi.fn(() => ({})),
  pullResourceStages: vi.fn()
}));
vi.mock('./companionDesktopSyncSummary', () => ({ loadCompanionDesktopSyncSummary: vi.fn() }));

import { syncCompanionObjectsFromDesktop } from './companionDesktopSyncObjects';

beforeEach(() => {
  vi.resetAllMocks();
  runtime.position.mockResolvedValue({ cursor: 0 });
  runtime.push.mockResolvedValue({ pushedObjectIds: [], pushedReviewOpIds: [],
    pushConflictCount: 0, pushRejectedCount: 0, pushError: null });
});

it('continues staged restore pages and publishes the ordinary cursor only after atomic adoption', async () => {
  runtime.apply
    .mockResolvedValueOnce(page(2, true))
    .mockResolvedValueOnce(page(4, true))
    .mockResolvedValueOnce(page(5, false));
  const structureSynced = vi.fn(() => {
    expect(runtime.apply).toHaveBeenCalledTimes(3);
    expect(runtime.save.mock.calls).toEqual([[5, 'source']]);
  });

  await expect(syncCompanionObjectsFromDesktop('http://source.test', {
    includeResources: false, restoreId: 'chosen', onStructureSynced: structureSynced
  })).resolves.toMatchObject({ appliedPackObjectCount: 2 });
  expect(runtime.apply.mock.calls.map(([request]) =>
    new URL(request.url).searchParams.get('after_state_seq'))).toEqual(['0', '2', '4']);
  expect(runtime.apply.mock.calls[1]![0]).toMatchObject({ expectedRestoreId: 'chosen' });
  expect(structureSynced).toHaveBeenCalledOnce();
  expect(runtime.push).not.toHaveBeenCalled();
});

it('still rejects an unverified ordinary page that consumes no objects', async () => {
  runtime.apply.mockResolvedValueOnce(page(2, true));
  await expect(syncCompanionObjectsFromDesktop('http://source.test', {
    includeResources: false
  })).rejects.toThrow('sync_pack_applied_no_objects');
  expect(runtime.save).not.toHaveBeenCalled();
});

function page(to: number, pending: boolean) {
  return { applied_blob_count: 0, applied_object_count: pending ? 0 : 2,
    restore_pending: pending, to_state_seq: to, frontier_state_seq: 5, source_epoch: 'chosen' };
}
