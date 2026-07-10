import type {
  NativeAssistantMessageResult,
  NativeAssistantThreadOpeningLocation
} from '../../lib/platform/nativeAssistantContract.js';
import {
  upsertAssistantThreadIndex
} from '../database/assistantThreadIndex.js';
import {
  appendAssistantThreadMessages
} from '../database/assistantThreadMessages.js';
import { openDatabaseConnection } from '../database/connection.js';

export function recordAssistantThreadSuccess(input: {
  clientTurnId: string;
  location: NativeAssistantThreadOpeningLocation;
  message: string;
  result: NativeAssistantMessageResult;
}) {
  return openDatabaseConnection().driver.transaction(() => {
    const threadIndex = upsertAssistantThreadIndex({
      location: input.location,
      message: input.message,
      providerThreadId: input.result.threadId ?? ''
    });
    appendAssistantThreadMessages([
      {
        id: `${input.result.turnId ?? input.clientTurnId}:user`,
        providerThreadId: input.result.threadId ?? '',
        role: 'user',
        text: input.message
      },
      {
        id: `${input.result.turnId ?? input.clientTurnId}:assistant`,
        providerThreadId: input.result.threadId ?? '',
        role: 'assistant',
        text: input.result.text ?? ''
      }
    ]);
    return threadIndex;
  });
}
