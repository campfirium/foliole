import { beforeEach, expect, it, vi } from 'vitest';

import type { RequestSyncPeerRound } from '../../../../../lib/core/sync/requestSyncPeerRound.js';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../../../../lib/platform/syncProtocolContract.js';

const runtime = vi.hoisted(() => ({ database: vi.fn(), resources: vi.fn() }));
vi.mock('./framed/companionRequestSyncDatabaseRound.js', () => ({ runCompanionRequestSyncDatabaseRound: runtime.database }));
vi.mock('./framed/companionRequestSyncResources.js', () => ({ continueCompanionRequestSyncResources: runtime.resources }));
vi.mock('./framed/companionRequestSyncPeerState.js', () => ({ requireCompanionRequestSyncPeerState:
  (_group: string, device: string, epoch: string) => ({ sender_device_identity_key: device, library_epoch: epoch }) }));
vi.mock('./syncGroupMemberStateStore.js', () => ({ loadCompanionSyncGroupMemberState: async () => ({ library_epoch: 'local-epoch' }) }));
vi.mock('./companionSyncHistoryCollection', () => ({ collectCompanionSyncHistory: vi.fn(), recordCompanionCompletedSyncRound: vi.fn() }));
vi.mock('./syncGroupStore', () => ({ loadCompanionSyncGroup: async () => ({ group_id: 'group', local_device_identity_key: 'local' }) }));
vi.mock('./framed/companionSyncPeerRounds.js', () => ({
  withCompanionSyncPeerRound: async (_peer: string, run: (round: RequestSyncPeerRound, signal: AbortSignal) => Promise<unknown>) => {
    const signal = new AbortController().signal;
    return run({ id: 'd3f3cceb-206e-49eb-b24b-7c9db0859ae8', admitted: false,
      lease: { signal, touch() {}, release() {} } }, signal);
  },
  withCompanionRequestSyncPeerRound: async (_context: unknown, _endpoint: string, _round: unknown, run: () => Promise<unknown>) => run()
}));

import { syncCompanionIdentityObjects } from './syncGroupIdentityCompanionResult';

const framedPeer = { deviceId: 'desktop', libraryEpoch: 'desktop-epoch', protocolVersion: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version };
beforeEach(() => {
  vi.clearAllMocks();
  runtime.database.mockResolvedValue({ pending: 1, received: ['pulled'], sent: ['pushed'], madeProgress: true });
  runtime.resources.mockResolvedValue({ pending: 3, transferred: 1 });
});

it('reserves a bounded attachment slice while database changes remain', async () => {
  const confirmed = vi.fn();
  const result = await syncCompanionIdentityObjects('http://peer', { framedPeer, onDatabaseConfirmed: confirmed });
  expect(runtime.resources).toHaveBeenCalledWith(expect.objectContaining({ boundedSlice: true }));
  expect(confirmed).not.toHaveBeenCalled();
  expect(result).toMatchObject({ remainingStructureChangeCount: 1,
    remainingAttachmentResourceCount: 3,
    appliedObjectIds: ['pulled'], pushedObjectIds: ['pushed'] });
});

it('does not treat deferred attachments as progress when database differences remain unchanged', async () => {
  const { hasFastRetryWork } = await import('../../../../companion/companionSyncContinuation');
  runtime.database.mockResolvedValue({ pending: 1, received: [], sent: [], madeProgress: false });
  runtime.resources.mockResolvedValue({ pending: 0, transferred: 0, blocks: 0, yielded: false });
  const result = await syncCompanionIdentityObjects('http://peer', { framedPeer });
  expect(runtime.resources).toHaveBeenCalledWith(expect.objectContaining({ boundedSlice: false }));
  expect(hasFastRetryWork(result)).toBe(false);
});

it('reports request-scoped database changes and keeps attachment progress separate', async () => {
  const refreshed = vi.fn();
  const result = await syncCompanionIdentityObjects('http://peer', { framedPeer, onStructureSynced: refreshed });
  expect(runtime.database).toHaveBeenCalledWith(expect.objectContaining({ endpointUrl: 'http://peer', groupId: 'group',
    localLibraryEpoch: 'local-epoch', peerState: { sender_device_identity_key: 'desktop', library_epoch: 'desktop-epoch' } }));
  expect(refreshed).toHaveBeenCalledOnce();
  expect(result).toMatchObject({ appliedNodeIds: ['pulled'], pushedNodeIds: ['pushed'],
    localDirtyCount: 1, remainingStructureChangeCount: 1, remainingAttachmentResourceCount: 3,
    transferredAttachmentCount: 1, madeDatabaseProgress: true });
});

it('rejects missing negotiation and the incompatible previous protocol', async () => {
  await expect(syncCompanionIdentityObjects('http://peer', {})).rejects.toThrow('framed_sync_peer_required');
  await expect(syncCompanionIdentityObjects('http://peer', { framedPeer: { ...framedPeer, protocolVersion: 23 } }))
    .rejects.toThrow('framed_sync_peer_required');
  expect(runtime.database).not.toHaveBeenCalled();
});

it('finishes an authenticated restore before a resource-only continuation', async () => {
  runtime.database.mockResolvedValue({ pending: 0, received: ['restored'], sent: [], madeProgress: true });
  await syncCompanionIdentityObjects('http://peer', { framedPeer, restoreId: 'restore-1', resourcesOnly: true });
  expect(runtime.database).toHaveBeenCalledWith(expect.objectContaining({ restoreId: 'restore-1' }));
  expect(runtime.resources).toHaveBeenCalledOnce();
});

it('continues attachments without replaying database changes', async () => {
  const result = await syncCompanionIdentityObjects('http://peer', { framedPeer, resourcesOnly: true });
  expect(runtime.database).not.toHaveBeenCalled();
  expect(runtime.resources).toHaveBeenCalledOnce();
  expect(result.appliedObjectIds).toEqual([]);
  expect(result.pushedObjectIds).toEqual([]);
  expect(result.remainingAttachmentResourceCount).toBe(3);
});

it.each([
  { databasePending: 0, resourcePending: 0, outcome: 'completed' },
  { databasePending: 1, resourcePending: 0, outcome: 'skipped' },
  { databasePending: 0, resourcePending: 1, outcome: 'skipped' }
])('reports the completed request round without a phantom body stage: %j', async ({ databasePending, resourcePending, outcome }) => {
  const { describeCompanionSyncPassResult } = await import('../../../../companion/companionSyncPassResult');
  runtime.database.mockResolvedValue({ pending: databasePending, received: [], sent: [] });
  runtime.resources.mockResolvedValue({ pending: resourcePending, transferred: 0 });
  const result = await syncCompanionIdentityObjects('http://peer', { framedPeer });
  expect(describeCompanionSyncPassResult(result).outcome).toBe(outcome);
});

it('preserves confirmed data when the attachment stage fails', async () => {
  const { describeCompanionSyncPassResult } = await import('../../../../companion/companionSyncPassResult');
  runtime.database.mockResolvedValue({ pending: 0, received: ['saved'], sent: [], madeProgress: true });
  runtime.resources.mockRejectedValue(new Error('attachment_connection_reset'));
  const result = await syncCompanionIdentityObjects('http://peer', { framedPeer });
  expect(result.databaseConfirmedAt).toEqual(expect.any(String));
  expect(result.appliedObjectIds).toEqual(['saved']);
  expect(result.attachmentResourceError).toBe('attachment_connection_reset');
  expect(result.remainingAttachmentResourceCount).toBeNull();
  expect(result.transferredAttachmentCount).toBeUndefined();
  expect(describeCompanionSyncPassResult(result)).toMatchObject({ result: 'partial', outcome: 'skipped',
    message: 'Text and state synced; attachments need another attempt.' });
});

it.each([{ resourcesOnly: false }, { resourcesOnly: true }])('does not confirm an incomplete or resource-only data round: %j', async options => {
  const confirmed = vi.fn();
  await syncCompanionIdentityObjects('http://peer', { framedPeer, ...options, onDatabaseConfirmed: confirmed });
  expect(confirmed).not.toHaveBeenCalled();
});

it('retains committed data and retries confirmation when the session acknowledgement fails', async () => {
  const { describeCompanionSyncPassResult } = await import('../../../../companion/companionSyncPassResult');
  const { hasRetryWork, resolveCompanionSyncContinuationMode } = await import('../../../../companion/companionSyncContinuation');
  runtime.database.mockResolvedValue({ pending: 0, received: ['saved'], sent: [], madeProgress: true });
  const confirmed = vi.fn(async () => { throw new Error('session_ack_unavailable'); });
  const result = await syncCompanionIdentityObjects('http://peer', { framedPeer, onDatabaseConfirmed: confirmed });
  expect(confirmed).toHaveBeenCalledOnce();
  expect(runtime.resources).toHaveBeenCalledOnce();
  expect(result).toMatchObject({ databaseConfirmedAt: expect.any(String), appliedObjectIds: ['saved'],
    sessionConfirmationPending: true });
  expect(describeCompanionSyncPassResult(result)).toMatchObject({ result: 'partial', outcome: 'skipped' });
  expect(hasRetryWork(result)).toBe(true);
  expect(resolveCompanionSyncContinuationMode(result)).toBe('full');
});

it('retries unfinished attachment scanning without treating an idle scan as transfer progress', async () => {
  const { hasRetryWork, hasFastRetryWork } = await import('../../../../companion/companionSyncContinuation');
  runtime.database.mockResolvedValue({ pending: 0, received: [], sent: [], madeProgress: false });
  runtime.resources.mockResolvedValue({ pending: null, transferred: 0, blocks: 0, yielded: false });
  const result = await syncCompanionIdentityObjects('http://peer', { framedPeer });
  expect(hasRetryWork(result)).toBe(true);
  expect(hasFastRetryWork(result)).toBe(false);
});
