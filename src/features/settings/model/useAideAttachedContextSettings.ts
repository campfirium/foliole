import {
  createDefaultAideAttachedContextSettings,
  normalizeAideAttachedContextSettings
} from '../../../../lib/core/assistant/aideAttachedContextSettings';
import {
  loadAssistantAttachedContextSettings,
  saveAssistantAttachedContextSettings
} from '../../../shared/platform/assistantRuntime';

import { useAideDeviceSettings } from './useAideDeviceSettings';

export function useAideAttachedContextSettings() {
  return useAideDeviceSettings({
    createDefault: createDefaultAideAttachedContextSettings,
    load: loadAssistantAttachedContextSettings,
    normalize: normalizeAideAttachedContextSettings,
    save: saveAssistantAttachedContextSettings
  });
}
