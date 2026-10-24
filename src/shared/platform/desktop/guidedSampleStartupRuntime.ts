import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import { getRuntimeInvoke } from '../runtimeInvoke';
import { logRuntimeError } from '../runtimeLogging';

/** The guided sample the desktop host seeded into a new library; hosts without one answer null. */
export async function consumeGuidedSampleStartup(): Promise<string | null> {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  try {
    const result = await invoke(NATIVE_COMMANDS.consumeGuidedSampleStartup);
    return result.rootNodeId;
  } catch (error) {
    logRuntimeError('guided sample startup failed', {
      action: 'consume_guided_sample_startup',
      area: 'native',
      command: NATIVE_COMMANDS.consumeGuidedSampleStartup,
      error,
      fallback: 'library opens without Flow'
    });
    return null;
  }
}
