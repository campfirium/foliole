import { beforeEach, expect, it, vi } from 'vitest';

// These tests exercise the retained sequence cursor route independently of the v21 identity route.
vi.mock('../../lib/platform/syncProtocolContract.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/platform/syncProtocolContract.js')>();
  return { ...actual, CURRENT_SYNC_PROTOCOL_DESCRIPTOR: {
    ...actual.CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
    version: 15, min_supported_version: 15, max_supported_version: 15
  } };
});

const runtime = vi.hoisted(() => ({
  assertCompatible: vi.fn(),
  assertResourcesComplete: vi.fn(),
  downloadPack: vi.fn(),
  downloadResources: vi.fn(),
  exchangeMemberState: vi.fn(),
  getPeerCursor: vi.fn(),
  loadPendingConflicts: vi.fn(),
  notifyApplied: vi.fn(),
  queryOne: vi.fn(),
  reconcileBodies: vi.fn(),
  refreshAdvertisement: vi.fn(),
  reportCursor: vi.fn(),
  recordActivity: vi.fn(),
  flushVersionReceipts: vi.fn(),
  setPeerCursor: vi.fn()
}));

vi.mock('../../lib/core/database/syncState.js', () => ({
  getPeerCursor: runtime.getPeerCursor,
  setPeerCursor: runtime.setPeerCursor
}));
vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: () => ({ driver: { kind: 'test', queryOne: runtime.queryOne } }),
  runWithDatabaseConnectionOwner: async (execute: () => unknown) => execute()
}));
vi.mock('../database/syncBodyProjectionReconcile.js', () => ({
  reconcileVersionedInlineBodies: runtime.reconcileBodies
}));
vi.mock('../database/syncGroupStore.js', () => ({ loadDesktopSyncGroup: vi.fn() }));
vi.mock('../database/watchedFolderConflictDecisions.js', () => ({
  loadPendingWatchedFolderConflicts: runtime.loadPendingConflicts
}));
vi.mock('./companionMdnsAdvertisement.js', () => ({
  refreshCompanionMdnsAdvertisement: runtime.refreshAdvertisement
}));
vi.mock('./desktopSyncGroupCursorCommit.js', () => ({
  reportDesktopSyncGroupCursorCommitted: runtime.reportCursor
}));
vi.mock('./desktopSyncGroupHttp.js', () => ({
  createDesktopSyncGroupSignedHeaders: vi.fn()
}));
vi.mock('./desktopSyncGroupPackApply.js', () => ({
  downloadAndApplyDesktopSyncGroupPack: runtime.downloadPack
}));
vi.mock('./desktopSyncGroupMemberState.js', () => ({
  exchangeDesktopSyncGroupMemberState: runtime.exchangeMemberState
}));
vi.mock('./desktopSyncGroupPeerCompatibility.js', () => ({
  assertDesktopSyncGroupPeerCompatible: runtime.assertCompatible
}));
vi.mock('./desktopSyncGroupPeerSingleFlight.js', () => ({
  runDesktopSyncGroupPeerSingleFlight: (_id: string, execute: () => unknown) => execute()
}));
vi.mock('./desktopSyncGroupVersionReceipts.js', () => ({
  flushDesktopSyncGroupVersionReceipts: runtime.flushVersionReceipts
}));
vi.mock('./desktopSyncGroupResources.js', () => ({
  assertDesktopSyncGroupResourcesComplete: runtime.assertResourcesComplete
}));
vi.mock('./desktopSyncGroupResourceArticleDrain.js', () => ({
  drainDesktopSyncGroupResourceArticles: runtime.downloadResources
}));
vi.mock('./desktopSyncGroupRoutes.js', () => ({ loadDesktopSyncGroupRoutes: vi.fn() }));
vi.mock('./workspaceSyncAppliedEvents.js', () => ({ notifyWorkspaceSyncApplied: runtime.notifyApplied }));
vi.mock('./desktopSyncActivityStore.js', () => ({ recordDesktopSyncActivity: runtime.recordActivity }));

import { continueDesktopSyncGroupSync } from './desktopSyncGroupTransport.js';

const peer = {
  endpoint_url: 'http://192.168.1.12:43121',
  group_id: 'group-1',
  local_device_id: 'desktop-a',
  peer_device_id: 'desktop-b',
  peer_device_name: 'Desktop B',
  peer_platform: 'windows'
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  runtime.getPeerCursor.mockReturnValue('0');
  runtime.queryOne.mockReturnValue(undefined);
  runtime.loadPendingConflicts.mockReturnValue([]);
  runtime.downloadPack.mockResolvedValue({
    cursor: 4,
    event: { appliedNodeIds: ['node-1'], appliedObjectIds: [], appliedReviewOpIds: [] },
    participatingArticleIds: ['article']
  });
  runtime.downloadResources.mockResolvedValue(undefined);
  runtime.reportCursor.mockResolvedValue(undefined);
  runtime.flushVersionReceipts.mockResolvedValue(undefined);
  runtime.assertCompatible.mockResolvedValue(undefined);
  runtime.exchangeMemberState.mockResolvedValue({ localExited: false, peerBlocked: false });
  runtime.reconcileBodies.mockReturnValue(0);
});

it('stops before content when member state marks the peer removed', async () => {
  runtime.exchangeMemberState.mockResolvedValueOnce({ localExited: false, peerBlocked: true });

  const activity = { runId: 'round', startedAt: 'now' };
  await expect(continueDesktopSyncGroupSync(peer, activity)).resolves.toEqual({ complete: false, cursor: 0 });
  expect(runtime.recordActivity).toHaveBeenLastCalledWith(activity,
    expect.objectContaining({ result: 'blocked', message: 'membership' }), peer);
  expect(runtime.downloadPack).not.toHaveBeenCalled();
  expect(runtime.downloadResources).not.toHaveBeenCalled();
});

it('exchanges sources but does not fetch articles while a watched conflict awaits a choice', async () => {
  runtime.loadPendingConflicts.mockReturnValueOnce([{ conflict_key: 'same-path' }]);

  await expect(continueDesktopSyncGroupSync(peer)).resolves.toEqual({ complete: false, cursor: 0 });
  expect(runtime.exchangeMemberState).toHaveBeenCalledOnce();
  expect(runtime.downloadPack).not.toHaveBeenCalled();
  expect(runtime.setPeerCursor).not.toHaveBeenCalled();
});

it('does not fetch or advance a cursor for an incompatible peer', async () => {
  runtime.assertCompatible.mockRejectedValueOnce(new Error('sync_group_peer_incompatible'));

  await expect(continueDesktopSyncGroupSync(peer)).rejects.toThrow('sync_group_peer_incompatible');
  expect(runtime.downloadPack).not.toHaveBeenCalled();
  expect(runtime.setPeerCursor).not.toHaveBeenCalled();
  expect(runtime.reportCursor).not.toHaveBeenCalled();
});

it('does not re-advertise after consuming a peer change', async () => {
  const activity = { runId: 'round', startedAt: 'now' };
  await expect(continueDesktopSyncGroupSync(peer, activity)).resolves.toEqual({ complete: true, cursor: 4 });
  expect(runtime.recordActivity).toHaveBeenLastCalledWith(activity,
    expect.objectContaining({ stage: 'resources', direction: 'local' }), undefined);

  expect(runtime.reportCursor).toHaveBeenCalledWith({
    cursor: 4,
    peerAuthorizationId: 'desktop-b'
  });
  expect(runtime.downloadResources).toHaveBeenCalledWith(peer);
  expect(runtime.refreshAdvertisement).not.toHaveBeenCalled();
});

it('reconciles already-versioned bodies before committing an automatic receive cursor', async () => {
  const sequence: string[] = [];
  runtime.reconcileBodies.mockImplementation(() => { sequence.push('body'); return 439; });
  runtime.setPeerCursor.mockImplementation(() => { sequence.push('cursor'); });

  await expect(continueDesktopSyncGroupSync(peer)).resolves.toEqual({ complete: true, cursor: 4 });
  expect(sequence).toEqual(['body', 'cursor']);
});

it('refreshes an applied document after its page commits while resources continue', async () => {
  let finishResources!: () => void;
  runtime.downloadResources.mockImplementationOnce(() => new Promise<void>((resolve) => {
    finishResources = resolve;
  }));

  const pending = continueDesktopSyncGroupSync(peer);
  await vi.waitFor(() => expect(runtime.downloadResources).toHaveBeenCalledOnce());
  expect(runtime.notifyApplied).toHaveBeenCalledWith({
    appliedNodeIds: ['node-1'], appliedObjectIds: [], appliedReviewOpIds: []
  });

  finishResources();
  await expect(pending).resolves.toEqual({ complete: true, cursor: 4 });
  expect(runtime.notifyApplied).toHaveBeenCalledOnce();
});

it('still refreshes an applied document when a resource transfer fails', async () => {
  runtime.downloadResources.mockRejectedValueOnce(new Error('offline'));

  await expect(continueDesktopSyncGroupSync(peer)).rejects.toThrow('sync_group_resources_failed: offline');
  expect(runtime.notifyApplied).toHaveBeenCalledOnce();
});

it('does not commit a receive cursor when body reconciliation fails', async () => {
  runtime.reconcileBodies.mockImplementation(() => { throw new Error('sync_body_projection_changed'); });

  await expect(continueDesktopSyncGroupSync(peer)).rejects.toThrow('sync_body_projection_changed');
  expect(runtime.setPeerCursor).not.toHaveBeenCalled();
});

it('preserves the committed cursor when the provider reports a non-contiguous page', async () => {
  runtime.downloadPack.mockRejectedValueOnce(new Error('sync_pack_cursor_not_contiguous'));

  await expect(continueDesktopSyncGroupSync(peer)).rejects.toThrow('sync_pack_cursor_not_contiguous');
  expect(runtime.downloadPack).toHaveBeenCalledOnce();
  expect(runtime.setPeerCursor).not.toHaveBeenCalled();
});

it('re-enumerates a legacy cursor from zero without changing it before the new page commits', async () => {
  runtime.getPeerCursor.mockReturnValue('94');
  runtime.downloadPack.mockRejectedValueOnce(new Error('offline'));
  await expect(continueDesktopSyncGroupSync(peer)).rejects.toThrow('offline');

  expect(runtime.downloadPack).toHaveBeenCalledWith(expect.objectContaining({ after: 0 }));
  expect(runtime.setPeerCursor).not.toHaveBeenCalled();
});

it('re-enumerates a mobile provider after the bounded-page compatibility check', async () => {
  runtime.getPeerCursor.mockReturnValue('94');
  runtime.downloadPack.mockRejectedValueOnce(new Error('offline'));
  await expect(continueDesktopSyncGroupSync({ ...(peer as object), peer_platform: 'android-capacitor' } as never))
    .rejects.toThrow('offline');
  expect(runtime.downloadPack).toHaveBeenCalledWith(expect.objectContaining({ after: 0 }));
  expect(runtime.setPeerCursor).not.toHaveBeenCalled();
});

it('resumes from the transactionally committed page after a lost outer cursor save', async () => {
  runtime.queryOne.mockReturnValueOnce({ completed: 0, cursor_state_seq: 5,
    frontier_state_seq: 8, restore_id: null, source_epoch: 'epoch-a' });
  runtime.downloadPack.mockResolvedValueOnce({
    cursor: 6,
    frontierStateSeq: 8,
    sourceEpoch: 'epoch-a',
    event: { appliedNodeIds: [], appliedObjectIds: [], appliedReviewOpIds: [] },
    participatingArticleIds: []
  }).mockResolvedValueOnce({
    cursor: 8, frontierStateSeq: 8, sourceEpoch: 'epoch-a',
    event: { appliedNodeIds: [], appliedObjectIds: [], appliedReviewOpIds: [] },
    participatingArticleIds: []
  });

  await expect(continueDesktopSyncGroupSync(peer)).resolves.toMatchObject({ cursor: 8 });
  expect(runtime.downloadPack).toHaveBeenCalledWith(expect.objectContaining({
    after: 5, frontierStateSeq: 8, sourceEpoch: 'epoch-a'
  }));
  expect(runtime.downloadPack).toHaveBeenCalledWith(expect.objectContaining({
    after: 6, frontierStateSeq: 8, sourceEpoch: 'epoch-a'
  }));
});

it('continues with the new frontier after a lost fact view is rebased', async () => {
  runtime.queryOne.mockReturnValueOnce({ completed: 0, cursor_state_seq: 5,
    frontier_state_seq: 8, restore_id: null, source_epoch: 'epoch-a' });
  runtime.downloadPack.mockResolvedValueOnce({ cursor: 6, roundRebased: true,
    frontierStateSeq: 9, sourceEpoch: 'epoch-a',
    event: { appliedNodeIds: [], appliedObjectIds: [], appliedReviewOpIds: [] },
    participatingArticleIds: []
  }).mockResolvedValueOnce({ cursor: 9, roundRebased: false,
    frontierStateSeq: 9, sourceEpoch: 'epoch-a',
    event: { appliedNodeIds: [], appliedObjectIds: [], appliedReviewOpIds: [] },
    participatingArticleIds: [] });

  await expect(continueDesktopSyncGroupSync(peer)).resolves.toMatchObject({ cursor: 9 });
  expect(runtime.downloadPack).toHaveBeenCalledWith(expect.objectContaining({
    after: 6, frontierStateSeq: 9, sourceEpoch: 'epoch-a'
  }));
});

it('continues the same restore without resetting the first committed page', async () => {
  runtime.exchangeMemberState.mockResolvedValueOnce({
    localExited: false, peerBlocked: false, restoreFromPeer: 'restore-a'
  });
  runtime.queryOne.mockReturnValueOnce({ completed: 0, cursor_state_seq: 5,
    frontier_state_seq: 8, restore_id: 'restore-a', source_epoch: 'epoch-a' });
  runtime.downloadPack.mockResolvedValueOnce({ cursor: 8,
    event: { appliedNodeIds: [], appliedObjectIds: [], appliedReviewOpIds: [] },
    participatingArticleIds: [] });

  await continueDesktopSyncGroupSync(peer);
  expect(runtime.downloadPack).toHaveBeenCalledWith(expect.objectContaining({
    after: 5, frontierStateSeq: 8, restoreId: 'restore-a', sourceEpoch: 'epoch-a'
  }));
});
