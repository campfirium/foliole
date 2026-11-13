import { loadSyncGroupLocalAdoption } from '../../../../../lib/core/sync/syncGroupLocalAdoption';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../../../../lib/platform/syncProtocolContract.js';
import type { CompanionDesktopSyncOptions } from '../../companionDesktopSyncTypes';
import { exchangeCompanionSyncGroupMemberState } from '../network/companionSyncGroupMemberState';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

import { syncCompanionIdentityObjects } from './syncGroupIdentityCompanionResult';
import { ensureCompanionSyncGroupDataOwner } from './syncGroupProviderDataOwner';

export async function completeCompanionSyncGroupAdoption(
  options: Pick<CompanionDesktopSyncOptions, 'onProgress' | 'onObjectRejection'> = {}
): Promise<void> {
  const adoption = await getIosCompanionDatabaseOwner().read(loadSyncGroupLocalAdoption);
  if (!adoption) return;
  await ensureCompanionSyncGroupDataOwner();
  const state = await exchangeCompanionSyncGroupMemberState({ endpointUrl: adoption.endpointUrl,
    deviceId: adoption.providerDeviceId, groupId: adoption.groupId });
  if (state.localExited || state.peerRemoved || !state.normalSyncReady || !state.peerLibraryEpoch) {
    throw new Error('sync_group_local_adoption_source_unavailable');
  }
  await syncCompanionIdentityObjects(adoption.endpointUrl, { ...options, framedPeer: {
    deviceId: adoption.providerDeviceId, libraryEpoch: state.peerLibraryEpoch,
    protocolVersion: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version
  } });
}
