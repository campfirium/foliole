import { Capacitor, registerPlugin } from '@capacitor/core';

import type { CompanionFolderBackupPort } from '../../../../../lib/platform/companionFolderBackupContract';
import { getCompanionRuntimeCapability, requireCompanionNativePlugin } from '../../companionRuntimeCapabilities';

const pluginName = 'FolioleCompanionFolderBackup';
const native = registerPlugin<CompanionFolderBackupPort>(pluginName);

export function supportsCompanionFolderDatabaseBackup() {
  const runtime = getCompanionRuntimeCapability();
  return (runtime.kind === 'android-native' || runtime.kind === 'ios-native') && Capacitor.isPluginAvailable(pluginName);
}

export function getCompanionFolderBackupPort(): CompanionFolderBackupPort {
  requireCompanionNativePlugin('folder-database-backup', pluginName);
  return native;
}
