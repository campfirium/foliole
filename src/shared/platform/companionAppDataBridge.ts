import { registerPlugin } from '@capacitor/core';

import type { NativeCompanionWorkspaceSyncState } from '../../../lib/platform/nativeCompanionSyncContract';

import { isNativeAndroidCompanionRuntime } from './companionWorkspaceSyncBridge';

export interface CompanionAppDataPlugin {
  clearAppData(): Promise<NativeCompanionWorkspaceSyncState>;
}

export const FolioleCompanionAppData = registerPlugin<CompanionAppDataPlugin>('FolioleCompanionAppData');

export { isNativeAndroidCompanionRuntime };
