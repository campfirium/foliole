import { Capacitor, registerPlugin } from '@capacitor/core';

import type { CompanionBackupRestorePort } from '../../../../../lib/platform/companionBackupRestoreContract';
import { getCompanionRuntimeCapability, requireCompanionNativePlugin } from '../../companionRuntimeCapabilities';

const pluginName = 'FolioleCompanionBackupRestore';
const native = registerPlugin<CompanionBackupRestorePort>(pluginName);

export function supportsCompanionBackupRestore() {
  return getCompanionRuntimeCapability().kind === 'android-native' && Capacitor.isPluginAvailable(pluginName);
}

export function getCompanionBackupRestorePort(): CompanionBackupRestorePort {
  requireCompanionNativePlugin('folder-database-backup', pluginName);
  return native;
}
