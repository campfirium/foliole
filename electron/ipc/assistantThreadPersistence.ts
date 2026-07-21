import type {
  NativeAssistantMessageResult,
  NativeAssistantThreadMessageRecord,
  NativeAssistantThreadOpeningLocation
} from '../../lib/platform/nativeAssistantContract.js';
import type { NativeAssistantImageAttachment } from '../../lib/platform/nativeAssistantImageContract.js';
import { openAssistantHistoryConnection } from '../database/assistantHistoryConnection.js';
import {
  upsertAssistantThreadIndex
} from '../database/assistantThreadIndex.js';
import {
  appendAssistantThreadMessages
} from '../database/assistantThreadMessages.js';

export function recordAssistantThreadSuccess(input: {
  agentToolVersion: number;
  clientTurnId: string;
  continuationMessages?: NativeAssistantThreadMessageRecord[];
  continuedFromThreadId?: string;
  location: NativeAssistantThreadOpeningLocation;
  message: string;
  images?: NativeAssistantImageAttachment[];
  result: NativeAssistantMessageResult;
}) {
  return openAssistantHistoryConnection().driver.transaction(() => {
    const turnId = input.result.turnId ?? input.clientTurnId;
    if (input.continuedFromThreadId) {
      appendAssistantThreadMessages([{
        createdAt: createContinuationPromptTime(input.continuationMessages),
        id: `${turnId}:user`,
        providerThreadId: input.continuedFromThreadId,
        role: 'user',
        text: input.message,
        ...(input.images?.length ? { images: input.images } : {})
      }]);
    }
    const threadIndex = upsertAssistantThreadIndex({
      agentToolVersion: input.agentToolVersion,
      ...(input.continuedFromThreadId ? { continuedFromThreadId: input.continuedFromThreadId } : {}),
      location: input.location,
      message: input.message,
      providerThreadId: input.result.threadId ?? ''
    });
    appendAssistantThreadMessages([
      ...(input.continuationMessages ?? []).map((message) => ({
        createdAt: message.createdAt,
        id: message.id,
        provider: message.provider,
        providerThreadId: input.result.threadId ?? '',
        role: message.role,
        text: message.text,
        ...(message.images?.length ? { images: message.images } : {})
      })),
      {
        id: `${turnId}:user`,
        providerThreadId: input.result.threadId ?? '',
        role: 'user',
        text: input.message,
        ...(input.images?.length ? { images: input.images } : {})
      },
      {
        id: `${turnId}:assistant`,
        providerThreadId: input.result.threadId ?? '',
        role: 'assistant',
        text: input.result.text ?? ''
      }
    ]);
    return threadIndex;
  });
}

function createContinuationPromptTime(messages?: NativeAssistantThreadMessageRecord[]) {
  const latest = Math.max(
    0,
    ...(messages ?? []).map((message) => Date.parse(message.createdAt)).filter(Number.isFinite)
  );
  return new Date(Math.max(Date.now(), latest + 1)).toISOString();
}
