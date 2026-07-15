import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { getRuntimeInvoke } from './runtimeInvoke';

export interface RuntimeLoginItemSettingsState {
  enabled: boolean;
  effective: boolean;
  status: 'disabled' | 'enabled' | 'error' | 'requires-approval' | 'system-disabled' | 'unsupported';
  supported: boolean;
}

const LOGIN_ITEM_STATUSES = new Set<RuntimeLoginItemSettingsState['status']>([
  'disabled', 'enabled', 'error', 'requires-approval', 'system-disabled', 'unsupported'
]);

function normalizeLoginItemSettingsState(value: unknown): RuntimeLoginItemSettingsState {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const status = LOGIN_ITEM_STATUSES.has(record.status as RuntimeLoginItemSettingsState['status'])
    ? record.status as RuntimeLoginItemSettingsState['status']
    : 'unsupported';
  return {
    enabled: record.enabled === true,
    effective: record.effective === true,
    status,
    supported: record.supported === true
  };
}

export async function loadLoginItemSettingsFromRuntime() {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return { enabled: false, effective: false, status: 'unsupported' as const, supported: false };
  }
  return normalizeLoginItemSettingsState(await runtimeInvoke(NATIVE_COMMANDS.loadLoginItemSettings));
}

export async function saveLoginItemSettingsToRuntime(enabled: boolean) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return { enabled: false, effective: false, status: 'unsupported' as const, supported: false };
  }
  return normalizeLoginItemSettingsState(await runtimeInvoke(NATIVE_COMMANDS.saveLoginItemSettings, { enabled }));
}
