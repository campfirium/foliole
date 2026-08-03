import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { NativeFolioleCliInstallState } from '../../../lib/platform/nativeUtilityCommandMap';

import { getRuntimeInvoke } from './runtimeInvoke';

const STATUSES = new Set<NativeFolioleCliInstallState['status']>([
  'cancelled', 'conflict', 'installed', 'not_installed', 'repair_required', 'unavailable'
]);

function normalize(value: unknown): NativeFolioleCliInstallState {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    commandPath: typeof record.commandPath === 'string' ? record.commandPath : null,
    error: record.error === 'conflict' || record.error === 'failed'
      ? record.error : null,
    packageManaged: record.packageManaged === true,
    status: STATUSES.has(record.status as NativeFolioleCliInstallState['status'])
      ? record.status as NativeFolioleCliInstallState['status'] : 'unavailable'
  };
}

export async function runFolioleCliInstallationAction(
  action: 'install' | 'remove' | 'repair' | 'status'
) {
  const invoke = getRuntimeInvoke();
  if (!invoke) return normalize(null);
  return normalize(await invoke(NATIVE_COMMANDS.folioleCliInstall, { action }));
}
