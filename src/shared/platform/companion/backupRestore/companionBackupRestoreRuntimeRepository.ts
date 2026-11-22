import { Capacitor, registerPlugin } from '@capacitor/core';

import type { CompanionBackupRestorePort } from '../../../../../lib/platform/companionBackupRestoreContract';
import { isCompanionNativeHost, requireCompanionNativePlugin } from '../../companionRuntimeCapabilities';

const pluginName = 'FolioleCompanionBackupRestore';
const native = registerPlugin<CompanionBackupRestorePort>(pluginName);

export function supportsCompanionBackupRestore() {
  return isCompanionNativeHost() && Capacitor.isPluginAvailable(pluginName);
}

export function getCompanionBackupRestorePort(): CompanionBackupRestorePort {
  requireCompanionNativePlugin('folder-database-backup', pluginName);
  return native;
}
