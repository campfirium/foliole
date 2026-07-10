import type {
  NativeAssistantSendMessageArgs,
  NativeAssistantSendMessageResult,
  NativeAssistantStatusResult,
  NativeAssistantThreadIndexListArgs,
  NativeAssistantThreadIndexMutationArgs,
  NativeAssistantThreadMessageListArgs,
  NativeAssistantThreadMessageRecord,
  NativeAssistantThreadIndexRecord,
  NativeAssistantTurnEvent
} from '../../../lib/platform/nativeAssistantContract';
import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { getElectronAPI } from './electronApi';
import { getRuntimeInvoke } from './runtimeInvoke';

export async function loadAssistantStatus(): Promise<NativeAssistantStatusResult | null> {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  return invoke(NATIVE_COMMANDS.assistantGetStatus);
}

export async function sendAssistantMessage(
  args: NativeAssistantSendMessageArgs
): Promise<NativeAssistantSendMessageResult | null> {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  return invoke(NATIVE_COMMANDS.assistantSendMessage, args);
}

export function subscribeAssistantTurnEvents(
  handler: (event: NativeAssistantTurnEvent) => void
) {
  return getElectronAPI()?.onAssistantTurnEvent?.(handler) ?? (() => undefined);
}

export async function listAssistantThreadIndex(
  args?: NativeAssistantThreadIndexListArgs
): Promise<NativeAssistantThreadIndexRecord[] | null> {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  return invoke(NATIVE_COMMANDS.assistantListThreadIndex, args);
}

export async function listAssistantThreadMessages(
  args: NativeAssistantThreadMessageListArgs
): Promise<NativeAssistantThreadMessageRecord[] | null> {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  return invoke(NATIVE_COMMANDS.assistantListThreadMessages, args);
}

export async function archiveAssistantThreadIndex(
  args: NativeAssistantThreadIndexMutationArgs
): Promise<NativeAssistantThreadIndexRecord | null> {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  return invoke(NATIVE_COMMANDS.assistantArchiveThreadIndex, args);
}

export async function removeAssistantThreadFromHistory(
  args: NativeAssistantThreadIndexMutationArgs
): Promise<NativeAssistantThreadIndexRecord | null> {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  return invoke(NATIVE_COMMANDS.assistantRemoveThreadFromHistory, args);
}
