import type {
  NativeAssistantFailureCategory,
  NativeAssistantSendMessageResult
} from '../../lib/platform/nativeAssistantContract.js';

import {
  CODEX_APP_SERVER_PROVIDER,
  mapAppServerEventError,
  sendFailure,
  type JsonRpcRecord
} from './codexAppServerProtocol.js';
import type { TurnState } from './codexAppServerSessionTypes.js';

export function refreshTurnIdleTimeout(turn: TurnState, onTimeout: () => void) {
  clearTimeout(turn.timeout);
  turn.timeout = setTimeout(onTimeout, turn.timeoutMs);
}

export function readTurnCompletionFailure(
  params: JsonRpcRecord | undefined
): NativeAssistantFailureCategory | null {
  const turn = asRecord(params?.turn);
  if (turn?.status === 'completed') return null;
  if (turn?.status === 'interrupted') return 'interrupted';
  if (turn?.status !== 'failed') return 'protocol_error';
  return mapAppServerEventError(asRecord(turn.error)) ?? 'internal_error';
}

export function resolveTurnCompletion(
  params: JsonRpcRecord | undefined,
  turn: TurnState
): NativeAssistantSendMessageResult {
  const failure = readTurnCompletionFailure(params);
  if (failure) return sendFailure('failed', failure);
  if (!turn.text.trim()) return sendFailure('failed', 'protocol_error');
  return {
    message: {
      text: turn.text,
      ...(turn.threadId ? { threadId: turn.threadId } : {}),
      ...(turn.turnId ? { turnId: turn.turnId } : {})
    },
    provider: CODEX_APP_SERVER_PROVIDER,
    state: 'ready'
  };
}

function asRecord(value: unknown): JsonRpcRecord | undefined {
  return value && typeof value === 'object' ? value as JsonRpcRecord : undefined;
}
