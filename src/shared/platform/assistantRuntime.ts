import type {
  NativeAssistantSendMessageArgs,
  NativeAssistantSendMessageResult,
  NativeAssistantStatusResult,
  NativeAssistantThreadIndexListArgs,
  NativeAssistantThreadIndexMutationArgs,
  NativeAssistantThreadIndexRecord
} from '../../../lib/platform/nativeAssistantContract';
import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { getRuntimeInvoke } from './bridge';

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

export async function listAssistantThreadIndex(
  args?: NativeAssistantThreadIndexListArgs
): Promise<NativeAssistantThreadIndexRecord[] | null> {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  return invoke(NATIVE_COMMANDS.assistantListThreadIndex, args);
}

export async function archiveAssistantThreadIndex(
  args: NativeAssistantThreadIndexMutationArgs
): Promise<NativeAssistantThreadIndexRecord | null> {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  return invoke(NATIVE_COMMANDS.assistantArchiveThreadIndex, args);
}

export async function deleteAssistantThreadIndex(
  args: NativeAssistantThreadIndexMutationArgs
): Promise<NativeAssistantThreadIndexRecord | null> {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  return invoke(NATIVE_COMMANDS.assistantDeleteThreadIndex, args);
}