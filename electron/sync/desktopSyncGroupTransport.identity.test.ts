import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../lib/platform/syncProtocolContract.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/platform/syncProtocolContract.js')>();
  return { ...actual, CURRENT_SYNC_PROTOCOL_DESCRIPTOR: {
    ...actual.CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
    version: 21, min_supported_version: 21, max_supported_version: 21
  } };
});

const runtime = vi.hoisted(() => ({
  exchangeMemberState: vi.fn(), runIdentityRound: vi.fn(),
  runIdentityRestore: vi.fn(), drainIdentityResources: vi.fn(),
  downloadPack: vi.fn(), queryOne: vi.fn(), setPeerCursor: vi.fn(),
  reportCursor: vi.fn(), pendingConflicts: vi.fn(), reconcileBodies: vi.fn()
}));

vi.mock('../../lib/core/database/syncState.js', () => ({
  getPeerCursor: vi.fn(), setPeerCursor: runtime.setPeerCursor
}));
vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: () => ({ driver: { queryOne: runtime.queryOne } }),
  runWithDatabaseConnectionOwner: async (task: () => unknown) => task()
}));
vi.mock('../database/syncBodyProjectionReconcile.js', () => ({
  reconcileVersionedInlineBodies: runtime.reconcileBodies
}));
vi.mock('../database/syncGroupStore.js', () => ({ loadDesktopSyncGroup: vi.fn() }));
vi.mock('../database/watchedFolderConflictDecisions.js', () => ({
  loadPendingWatchedFolderConflicts: runtime.pendingConflicts
}));
vi.mock('./desktopSyncActivityStore.js', () => ({ recordDesktopSyncActivity: vi.fn() }));
vi.mock('./desktopSyncGroupCursorCommit.js', () => ({
  reportDesktopSyncGroupCursorCommitted: runtime.reportCursor
}));
vi.mock('./desktopSyncGroupHttp.js', () => ({
  createDesktopSyncGroupSignedHeaders: vi.fn()
}));
vi.mock('./desktopSyncGroupMemberState.js', () => ({
  exchangeDesktopSyncGroupMemberState: runtime.exchangeMemberState
}));
vi.mock('./desktopSyncGroupPackApply.js', () => ({
  downloadAndApplyDesktopSyncGroupPack: runtime.downloadPack
}));
vi.mock('./desktopSyncGroupPeerCompatibility.js', () => ({
  assertDesktopSyncGroupPeerCompatible: vi.fn()
}));
vi.mock('./desktopSyncGroupPeerSingleFlight.js', () => ({
  runDesktopSyncGroupPeerSingleFlight: (_id: string, task: () => unknown) => task()
}));
vi.mock('./desktopSyncGroupResourceArticleDrain.js', () => ({
  drainDesktopSyncGroupResourceArticles: vi.fn(),
  drainDesktopSyncIdentityResources: runtime.drainIdentityResources
}));
vi.mock('./desktopSyncGroupResources.js', () => ({
  assertDesktopSyncGroupResourcesComplete: vi.fn()
}));
vi.mock('./desktopSyncGroupRoutes.js', () => ({ loadDesktopSyncGroupRoutes: vi.fn() }));
vi.mock('./desktopSyncGroupVersionReceipts.js', () => ({
  flushDesktopSyncGroupVersionReceipts: vi.fn()
}));
vi.mock('./desktopSyncIdentityRound.js', () => ({
  runDesktopSyncIdentityRound: runtime.runIdentityRound
}));
vi.mock('./desktopSyncIdentityRestoreRound.js', () => ({
  runDesktopSyncIdentityRestoreRound: runtime.runIdentityRestore
}));
vi.mock('./workspaceSyncAppliedEvents.js', () => ({ notifyWorkspaceSyncApplied: vi.fn() }));

import { continueDesktopSyncGroupSync } from './desktopSyncGroupTransport.js';

const peer = { endpoint_url: 'http://peer', group_id: 'group',
  local_device_id: 'desktop-a', peer_device_id: 'desktop-b' } as never;

beforeEach(() => {
  vi.clearAllMocks();
  runtime.pendingConflicts.mockReturnValue([]);
  runtime.exchangeMemberState.mockResolvedValue({ localExited: false, peerBlocked: false });
  runtime.runIdentityRound.mockResolvedValue({ verifiedCandidateCount: 0 });
});

it('uses a completed identity probe without reading or committing a foreign sequence', async () => {
  await expect(continueDesktopSyncGroupSync(peer)).resolves.toEqual({ complete: true });
  expect(runtime.runIdentityRound).toHaveBeenCalledWith(peer);
  expect(runtime.queryOne).not.toHaveBeenCalled();
  expect(runtime.downloadPack).not.toHaveBeenCalled();
  expect(runtime.setPeerCursor).not.toHaveBeenCalled();
  expect(runtime.reportCursor).not.toHaveBeenCalled();
});

it('restores the complete identity set before the ordinary identity round', async () => {
  runtime.exchangeMemberState.mockResolvedValueOnce({ localExited: false,
    peerBlocked: false, restoreFromPeer: 'restore-1' }).mockResolvedValueOnce({
    localExited: false, peerBlocked: false, restoreFromPeer: 'restore-1'
  }).mockResolvedValue({ localExited: false, peerBlocked: false });
  runtime.runIdentityRestore.mockResolvedValue({ applied: true });

  await expect(continueDesktopSyncGroupSync(peer)).resolves.toEqual({ complete: true });
  expect(runtime.runIdentityRestore).toHaveBeenCalledWith(peer, 'restore-1');
  expect(runtime.drainIdentityResources).toHaveBeenCalledWith(peer);
  expect(runtime.runIdentityRound).toHaveBeenCalledWith(peer);
  expect(runtime.downloadPack).not.toHaveBeenCalled();
  expect(runtime.setPeerCursor).not.toHaveBeenCalled();
});
