import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import type {
  NativeReadwiseApiConnection,
  NativeReadwiseApiConnectionResult
} from '../../../../lib/platform/nativeReadwiseApiConnectionContract';
import { getRuntimeInvoke } from '../runtimeInvoke';

const DISCONNECTED: NativeReadwiseApiConnection = {
  has_credential: false,
  has_source: false,
  state: 'disconnected',
  verified_at: null
};

export async function loadReadwiseApiConnectionFromRuntime() {
  const invoke = getRuntimeInvoke();
  return invoke ? invoke(NATIVE_COMMANDS.loadReadwiseApiConnection) : DISCONNECTED;
}

export async function connectReadwiseApiFromClipboardInRuntime(
  sourceIntent: 'continue' | 'replace' = 'continue'
): Promise<NativeReadwiseApiConnectionResult> {
  const invoke = getRuntimeInvoke();
  return invoke ? invoke(NATIVE_COMMANDS.connectReadwiseApiFromClipboard, { source_intent: sourceIntent }) : {
    connection: DISCONNECTED,
    status: 'connection_failed'
  };
}

export async function disconnectReadwiseApiInRuntime(): Promise<NativeReadwiseApiConnectionResult> {
  const invoke = getRuntimeInvoke();
  return invoke ? invoke(NATIVE_COMMANDS.disconnectReadwiseApi) : {
    connection: DISCONNECTED,
    status: 'connection_failed'
  };
}
