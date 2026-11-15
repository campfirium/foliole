import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import type { NativeSupportLogAction, NativeSupportLogState } from '../../../../lib/platform/nativeUtilityContract';
import { getRuntimeInvoke } from '../runtimeInvoke';

export type { NativeSupportLogAction, NativeSupportLogState };

export async function runDesktopSupportLogAction(action: NativeSupportLogAction): Promise<NativeSupportLogState> {
  const invoke = getRuntimeInvoke();
  if (!invoke) throw new Error('Desktop log unavailable');
  const result = await invoke(NATIVE_COMMANDS.desktopSupportLog, { action });
  if (result?.phase === 'idle' || result?.phase === 'ready') return result;
  if (result?.phase === 'recording' && Number.isFinite(result.startedAt)) return result;
  throw new Error('Invalid desktop log state');
}
