import {
  createDefaultAideToolPermissionSettings,
  normalizeAideToolPermissionSettings
} from '../../../../lib/core/assistant/aideToolPermissionSettings';
import {
  loadAssistantToolPermissions,
  saveAssistantToolPermissions
} from '../../../shared/platform/assistantRuntime';

import { useAideDeviceSettings } from './useAideDeviceSettings';

export function useAideToolPermissionSettings() {
  return useAideDeviceSettings({
    createDefault: createDefaultAideToolPermissionSettings,
    load: loadAssistantToolPermissions,
    normalize: normalizeAideToolPermissionSettings,
    save: saveAssistantToolPermissions
  });
}
