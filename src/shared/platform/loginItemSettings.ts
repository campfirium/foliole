import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { getRuntimeInvoke } from './runtimeInvoke';

export interface RuntimeLoginItemSettingsState {
  enabled: boolean;
  effective: boolean;
  supported: boolean;
}

function normalizeLoginItemSettingsState(value: unknown): RuntimeLoginItemSettingsState {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    enabled: record.enabled === true,
    effective: record.effective === true,
    supported: record.supported === true
  };
}

export async function loadLoginItemSettingsFromRuntime() {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return { enabled: false, effective: false, supported: false };
  }
  return normalizeLoginItemSettingsState(await runtimeInvoke(NATIVE_COMMANDS.loadLoginItemSettings));
}

export async function saveLoginItemSettingsToRuntime(enabled: boolean) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return { enabled: false, effective: false, supported: false };
  }
  return normalizeLoginItemSettingsState(await runtimeInvoke(NATIVE_COMMANDS.saveLoginItemSettings, { enabled }));
}
