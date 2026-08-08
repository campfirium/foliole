import type { NativeCompanionBootstrapState } from '../../../../../lib/platform/nativeCompanionContract';
import type { SyncGroupPayload } from '../../../../../lib/platform/syncGroupContract';
import { loadAppVersion } from '../../appVersion';
import { FolioleCompanionSync, isAvailableNativeAndroidCompanionRuntime } from '../../companionWorkspaceRuntimeRepository';

export async function reconcileCompanionSyncGroupProvider(
  bootstrap: NativeCompanionBootstrapState,
  group: SyncGroupPayload | null
) {
  if (!isAvailableNativeAndroidCompanionRuntime()) return null;
  if (!group || group.local_member_state !== 'active' || !bootstrap.database_path) {
    return FolioleCompanionSync.stopSyncGroupProvider();
  }
  return FolioleCompanionSync.startSyncGroupProvider({
    app_version: await loadAppVersion(),
    database_path: bootstrap.database_path,
    device_id: bootstrap.device_id,
    device_name: bootstrap.device_name ?? 'Android device',
    sync_group: group
  });
}

export function loadCompanionSyncGroupProviderState() {
  return FolioleCompanionSync.loadSyncGroupProviderState();
}

export function approveCompanionSyncGroupJoinRequest(pairRequestId: string) {
  return FolioleCompanionSync.approveSyncGroupJoinRequest({ pair_request_id: pairRequestId });
}

export function rejectCompanionSyncGroupJoinRequest(pairRequestId: string) {
  return FolioleCompanionSync.rejectSyncGroupJoinRequest({ pair_request_id: pairRequestId });
}
