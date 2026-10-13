import { classifyResourceFailure } from '../../../lib/platform/resourceAvailabilityContract';

import { invalidateAttachmentResourceResolution } from './attachmentResources';
import { loadCompanionResourceProviders } from './companion/network/companionResourceProviders';
import { exchangeCompanionSyncGroupMemberState } from './companion/network/companionSyncGroupMemberState';
import { withCompanionRequestSyncLifecycle } from './companion/sync/framed/companionRequestSyncLifecycle';
import { pullCompanionRequestSyncResource } from './companion/sync/framed/companionRequestSyncResources';
import { withCompanionSyncPeerRound } from './companion/sync/framed/companionSyncPeerRounds';
import { loadCompanionMissingAttachmentResource } from './companionSyncObjects';
import { isNativeCompanionAttachmentResourceRuntime } from './companionWorkspaceRuntimeRepository';

export async function syncCompanionAttachmentResourceFromDesktop(endpointUrl: string, attachmentId: string) {
  const request = await loadCompanionMissingAttachmentResource(attachmentId);
  if (!request) return { attachmentId, status: 'not_queued' as const };
  if (!isNativeCompanionAttachmentResourceRuntime()) return { attachmentId, status: 'missing' as const };
  const cached = await withCompanionRequestSyncLifecycle(async signal => {
    const { providers } = await loadCompanionResourceProviders(endpointUrl);
    for (const provider of providers) {
      signal.throwIfAborted();
      try {
        const state = await exchangeCompanionSyncGroupMemberState(provider);
        signal.throwIfAborted();
        if (state.localExited) return false;
        if (state.peerRemoved || !state.normalSyncReady || !state.peerLibraryEpoch) continue;
        const peerEpoch = state.peerLibraryEpoch;
        await withCompanionSyncPeerRound(provider.deviceId, (peerRound, roundSignal) =>
          pullCompanionRequestSyncResource({ endpoint_url: provider.endpointUrl,
            sync_group_id: provider.groupId, receiver_device_id: provider.deviceId,
            receiver_library_epoch: peerEpoch, storageKey: request.storage_key,
            peerRound, signal: roundSignal }));
        signal.throwIfAborted();
        return true;
      } catch (error) {
        signal.throwIfAborted();
        if (classifyResourceFailure(error) === 'disk_full') throw new Error('attachment_resource_disk_full', { cause: error });
        if (error instanceof Error && /library_changed|library_closed|generation|foreground_ended|owner_closed/.test(error.message)) throw error;
        console.warn('[sync] attachment source failed', { deviceId: provider.deviceId,
          storageKey: request.storage_key, error: String(error) });
      }
    }
    return false;
  });
  if (cached) invalidateAttachmentResourceResolution(attachmentId);
  return { attachmentId, status: cached ? 'cached' as const : 'missing' as const };
}
