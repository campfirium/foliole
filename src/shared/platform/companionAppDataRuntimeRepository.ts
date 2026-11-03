import { registerPlugin } from '@capacitor/core';

import type { NativeCompanionWorkspaceSyncState } from '../../../lib/platform/nativeCompanionSyncContract';

import { getCompanionRuntimeCapability } from './companionRuntimeCapabilities';
import { isNativeAndroidCompanionRuntime } from './companionWorkspaceRuntimeRepository';

export interface CompanionAppDataPlugin {
  clearAppData(): Promise<NativeCompanionWorkspaceSyncState>;
}

interface IosCompanionAppDataFilesPlugin {
  clearAppData(): Promise<void>;
}

// iOS clears native files after the shared SQLite owner has closed its databases.
export const FolioleIosCompanionAppDataFiles = registerPlugin<IosCompanionAppDataFilesPlugin>('FolioleCompanionSync');

export const FolioleCompanionAppData = registerPlugin<CompanionAppDataPlugin>('FolioleCompanionAppData');

export function supportsCompanionAppDataClear() {
  const runtime = getCompanionRuntimeCapability();
  return runtime.kind === 'android-native' || runtime.kind === 'ios-native' || runtime.kind === 'web-preview';
}

export { isNativeAndroidCompanionRuntime };
