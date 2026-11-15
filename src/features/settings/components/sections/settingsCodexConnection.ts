import type { NativeAssistantFailureCategory, NativeAssistantStatusResult } from '../../../../../lib/platform/nativeAssistantContract';
import {
  loadAssistantStatus,
  startAssistantChatGptLogin
} from '../../../../shared/platform/assistantRuntime';

export type SettingsCodexConnectionState =
  | 'checking'
  | 'connected'
  | 'connecting'
  | 'signed_out'
  | 'missing'
  | 'unavailable';

export async function signInCodex(
  setConnection: (value: SettingsCodexConnectionState) => void,
  setSigningIn: (value: boolean) => void
) {
  setConnection('connecting');
  setSigningIn(true);
  try {
    const result = await startAssistantChatGptLogin();
    if (result?.state !== 'ready') {
      setConnection(connectionFailure(result?.failure?.category));
      return;
    }
    setConnection(await readCodexConnection());
  } catch {
    setConnection('unavailable');
  } finally {
    setSigningIn(false);
  }
}

export async function readCodexConnection(): Promise<SettingsCodexConnectionState> {
  try {
    return codexConnectionFromStatus(await loadAssistantStatus());
  } catch {
    return 'unavailable';
  }
}

function codexConnectionFromStatus(
  status: NativeAssistantStatusResult | null
): SettingsCodexConnectionState {
  if (status?.state === 'ready') return 'connected';
  return connectionFailure(status?.failure?.category);
}

function connectionFailure(category: NativeAssistantFailureCategory | undefined): SettingsCodexConnectionState {
  if (category === 'auth_failed') return 'signed_out';
  if (category === 'not_configured') return 'missing';
  return 'unavailable';
}
