import { loadSyncGroupLocalAdoption } from '../../../../../lib/core/sync/syncGroupLocalAdoption';
import { exchangeCompanionSyncGroupMemberState } from '../network/companionSyncGroupMemberState';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

import { adoptCompanionSyncGroupData } from './framed/companionSyncGroupLocalAdoption';

export async function completeCompanionSyncGroupAdoption() {
  const adoption = await getIosCompanionDatabaseOwner().read(loadSyncGroupLocalAdoption);
  if (!adoption) return;
  const state = await exchangeCompanionSyncGroupMemberState({ endpointUrl: adoption.endpointUrl,
    deviceId: adoption.providerDeviceId, groupId: adoption.groupId });
  if (state.localExited || state.peerRemoved || !state.normalSyncReady || !state.peerLibraryEpoch) {
    throw new Error('sync_group_local_adoption_source_unavailable');
  }
  await adoptCompanionSyncGroupData({ endpoint_url: adoption.endpointUrl,
    receiver_device_id: adoption.providerDeviceId, receiver_library_epoch: state.peerLibraryEpoch,
    sync_group_id: adoption.groupId }, adoption);
}
