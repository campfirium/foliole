import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import { getRuntimeInvoke } from '../runtimeInvoke';

export function loadDesktopSyncDiagnostics() {
  const invoke = getRuntimeInvoke();
  if (!invoke) return Promise.reject(new Error('sync_diagnostics_bridge_unavailable'));
  return invoke(NATIVE_COMMANDS.loadDesktopSyncDiagnostics);
}
