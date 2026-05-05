import type { NativeCompanionWorkspaceSyncState } from '../../../lib/platform/nativeCompanionSyncContract';

import {
  FolioleCompanionAppData,
  isNativeAndroidCompanionRuntime
} from './companionAppDataBridge';
import {
  normalizeWorkspaceSyncState,
  readWebSyncState,
  writeWebSyncState
} from './companionWorkspaceSyncState';

export async function clearCompanionAppData(): Promise<NativeCompanionWorkspaceSyncState> {
  if (!isNativeAndroidCompanionRuntime()) {
    return writeWebSyncState({
      ...readWebSyncState(),
      endpoint_url: null,
      last_synced_at: null,
      remembered_targets: [],
      sync_events: [],
      sync_onboarding_status: 'pending',
      workspace_snapshot: null
    });
  }
  return normalizeWorkspaceSyncState(await FolioleCompanionAppData.clearAppData());
}
