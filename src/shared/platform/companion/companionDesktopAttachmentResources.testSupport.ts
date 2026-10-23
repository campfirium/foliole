import { vi } from 'vitest';

import type { RequestSyncPeerRound } from '../../../../lib/core/sync/requestSyncPeerRound';
import { createSyncPeerRoundOwnership } from '../../../../lib/core/sync/syncPeerRoundOwnership';
import { withCompanionRequestSyncLifecycle } from '../companion/sync/framed/companionRequestSyncLifecycle';

const attachment = vi.hoisted(() => ({
  platform: 'android', active: true, listeners: new Set<() => void>(),
  missing: vi.fn(), providers: vi.fn(), exchange: vi.fn(), pull: vi.fn(), invalidate: vi.fn(), round: vi.fn()
}));

vi.mock('../companionSyncObjects', () => ({ loadCompanionMissingAttachmentResource: attachment.missing }));
vi.mock('../attachmentResources', () => ({ invalidateAttachmentResourceResolution: attachment.invalidate }));
vi.mock('../companionWorkspaceRuntimeRepository', () => ({
  isNativeCompanionAttachmentResourceRuntime: () => ['android', 'ios'].includes(attachment.platform)
}));
vi.mock('../companion/network/companionResourceProviders', () => ({ loadCompanionResourceProviders: attachment.providers }));
vi.mock('../companion/network/companionSyncGroupMemberState', () => ({ exchangeCompanionSyncGroupMemberState: attachment.exchange }));
vi.mock('../companion/sync/framed/companionRequestSyncResources', () => ({ pullCompanionRequestSyncResource: attachment.pull }));
vi.mock('../appLifecycle', () => ({
  readNativeAppActiveState: async () => attachment.active,
  subscribeNativeAppEnteredBackground: async (listener: () => void) => {
    attachment.listeners.add(listener);
    return () => { attachment.listeners.delete(listener); };
  }
}));
vi.mock('../companion/sync/framed/companionSyncPeerRounds', () => ({ withCompanionSyncPeerRound: attachment.round }));


export const key = `${'a'.repeat(64)}.png`;
export const peers = ['first', 'second'].map(deviceId => ({ deviceId, groupId: 'group', endpointUrl: `http://${deviceId}` }));
export const readyState = { localExited: false, peerRemoved: false, normalSyncReady: true, peerLibraryEpoch: 'peer-epoch' };

export function resetAttachmentFixture() {
  vi.resetAllMocks();
  attachment.platform = 'android'; attachment.active = true; attachment.listeners.clear();
  attachment.missing.mockResolvedValue({ attachment_id: 'a'.repeat(64), storage_key: key });
  attachment.providers.mockResolvedValue({ providers: peers });
  attachment.exchange.mockResolvedValue(readyState);
  attachment.pull.mockResolvedValue({ complete: true, blocks: 1 });
  attachment.round.mockImplementation((id: string, execute: (round: RequestSyncPeerRound, signal: AbortSignal) => Promise<unknown>) =>
    withCompanionRequestSyncLifecycle(async signal => {
      const owner = createSyncPeerRoundOwnership(60_000);
      const roundId = crypto.randomUUID();
      const lease = owner.acquireOutbound(id, roundId);
      if (!lease) throw new Error('fixture_peer_busy');
      try { return await execute({ id: roundId, lease, admitted: false }, signal); }
      finally { lease.release(); owner.close(); }
    }));
}

export function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

export { attachment };
