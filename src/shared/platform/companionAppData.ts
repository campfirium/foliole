import type { NativeCompanionWorkspaceSyncState } from '../../../lib/platform/nativeCompanionSyncContract';

import { clearIosCompanionActiveData } from './companion/runtime/iosCompanionActiveDataClear';
import {
  FolioleCompanionAppData,
  isNativeAndroidCompanionRuntime
} from './companionAppDataRuntimeRepository';
import { getCompanionRuntimeCapability } from './companionRuntimeCapabilities';
import {
  normalizeWorkspaceSyncState,
  readWebSyncState,
  writeWebSyncState
} from './companionWorkspaceSyncState';

export async function clearCompanionAppData(): Promise<NativeCompanionWorkspaceSyncState> {
  const runtime = getCompanionRuntimeCapability();
  if (runtime.kind !== 'android-native' && runtime.kind !== 'ios-native') {
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
  const state = await clearIosCompanionActiveData();
  if (isNativeAndroidCompanionRuntime()) await FolioleCompanionAppData.clearAppData();
  return normalizeWorkspaceSyncState(state);
}
