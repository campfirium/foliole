import type {
  NativeAssistantSendMessageResult,
  NativeAssistantThreadOpeningLocation
} from '../../lib/platform/nativeAssistantContract.js';
import {
  cleanupCreatedAssistantImages,
  type StoredAssistantImage
} from '../assistant/assistantImageStorage.js';
import { runWithAssistantHistoryConnectionOwner } from '../database/assistantHistoryConnection.js';

import type { prepareAssistantThreadContinuation } from './assistantThreadContinuation.js';
import { recordAssistantThreadSuccess } from './assistantThreadPersistence.js';

export async function finishAssistantTurn(input: {
  clientTurnId: string;
  continuation: Awaited<ReturnType<typeof prepareAssistantThreadContinuation>>;
  images: StoredAssistantImage[];
  message: string;
  openingLocation?: NativeAssistantThreadOpeningLocation;
  result: NativeAssistantSendMessageResult | null;
}) {
  const { clientTurnId, continuation, images, message, openingLocation, result } = input;
  if (!result) {
    await discardUncommittedImages(images);
    return protocolFailure();
  }
  const readyMessage = result.message;
  if (result.state !== 'ready' || !openingLocation || !readyMessage?.threadId) {
    await discardUncommittedImages(images);
    return result;
  }
  if (typeof readyMessage.text === 'string' && !readyMessage.text.trim()) {
    await discardUncommittedImages(images);
    return protocolFailure();
  }
  try {
    const threadIndex = await runWithAssistantHistoryConnectionOwner(() => recordAssistantThreadSuccess({
      agentToolVersion: continuation.agentToolVersion,
      clientTurnId,
      ...continuationPersistenceInput(continuation),
      images,
      location: openingLocation,
      message,
      result: readyMessage
    }));
    return { ...result, threadIndex };
  } catch {
    await discardUncommittedImages(images);
    return {
      failure: { category: 'persistence_failed' as const },
      provider: result.provider,
      state: 'failed' as const
    };
  }
}

async function discardUncommittedImages(images: StoredAssistantImage[]) {
  try {
    await cleanupCreatedAssistantImages(images);
  } catch {
    // The image has no database reference; a failed cleanup leaves only a recoverable orphan file.
  }
}

function continuationPersistenceInput(
  continuation: Awaited<ReturnType<typeof prepareAssistantThreadContinuation>>
) {
  return {
    ...(continuation.persistedContinuationMessages
      ? { continuationMessages: continuation.persistedContinuationMessages }
      : {}),
    ...(continuation.continuedFromThreadId
      ? { continuedFromThreadId: continuation.continuedFromThreadId }
      : {})
  };
}

function protocolFailure() {
  return {
    failure: { category: 'protocol_error' as const },
    provider: 'codex-app-server' as const,
    state: 'failed' as const
  };
}
