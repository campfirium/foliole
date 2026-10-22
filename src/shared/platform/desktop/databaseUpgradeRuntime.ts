import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import type { NativeDatabaseUpgradeStatus } from '../../../../lib/platform/nativeDatabaseUpgradeContract';
import { getRuntimeInvoke } from '../runtimeInvoke';

/** Answered before the library opens; hosts without a desktop runtime never upgrade at startup. */
export async function loadDatabaseUpgradeStatus(): Promise<NativeDatabaseUpgradeStatus> {
  const invoke = getRuntimeInvoke();
  if (!invoke) return { state: 'ready' };
  return invoke(NATIVE_COMMANDS.loadDatabaseUpgradeStatus);
}
