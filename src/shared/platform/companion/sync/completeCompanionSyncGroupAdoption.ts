import { loadSyncGroupLocalAdoption } from '../../../../../lib/core/sync/syncGroupLocalAdoption';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../../../../lib/platform/syncProtocolContract.js';
import type { CompanionDesktopSyncOptions } from '../../companionDesktopSyncTypes';
import { exchangeCompanionSyncGroupMemberState } from '../network/companionSyncGroupMemberState';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

import { measureCompanionAdoption } from './companionAdoptionPerformance';
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
  const { peerLibraryEpoch } = state;
  if (state.localExited || state.peerRemoved || !state.normalSyncReady || !peerLibraryEpoch) {
    throw new Error('sync_group_local_adoption_source_unavailable');
  }
  const receiveOptions = { ...options, framedPeer: {
    deviceId: adoption.providerDeviceId, libraryEpoch: peerLibraryEpoch,
    protocolVersion: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version
  } };
  const label = import.meta.env.VITE_FOLIOLE_ADOPTION_PERFORMANCE_LABEL;
  if (label) await measureCompanionAdoption(label, () => syncCompanionIdentityObjects(adoption.endpointUrl, receiveOptions));
  else await syncCompanionIdentityObjects(adoption.endpointUrl, receiveOptions);
}
