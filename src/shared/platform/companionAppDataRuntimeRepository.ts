import { registerPlugin } from '@capacitor/core';

import type { NativeCompanionWorkspaceSyncState } from '../../../lib/platform/nativeCompanionSyncContract';

import { getCompanionRuntimeCapability } from './companionRuntimeCapabilities';
import { isNativeAndroidCompanionRuntime } from './companionWorkspaceRuntimeRepository';

export interface CompanionAppDataPlugin {
  clearAppData(): Promise<NativeCompanionWorkspaceSyncState>;
}

export const FolioleCompanionAppData = registerPlugin<CompanionAppDataPlugin>('FolioleCompanionAppData');

export function supportsCompanionAppDataClear() {
  const runtime = getCompanionRuntimeCapability();
  // Keep iOS disabled until SQLite, files, UserDefaults, and Keychain can be cleared atomically.
  return runtime.kind === 'android-native' || runtime.kind === 'web-preview';
}

export { isNativeAndroidCompanionRuntime };
