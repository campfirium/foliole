import type { NativeAssistantTurnEvent } from '../../lib/platform/nativeAssistantContract.js';

import { CODEX_APP_SERVER_PROVIDER } from './codexAppServerProtocol.js';
import { readDeltaText, readNestedString, type JsonRpcMessage } from './codexAppServerProtocol.js';
import type { TurnState } from './codexAppServerSessionTypes.js';

export function emitCodexAppServerTurnEvent(
  turn: TurnState,
  event: Pick<NativeAssistantTurnEvent, 'failure' | 'kind' | 'text'> & {
    providerThreadId?: string;
  }
) {
  const providerThreadId = event.providerThreadId ?? turn.threadId;
  turn.onEvent?.({
    clientTurnId: turn.clientTurnId,
    provider: CODEX_APP_SERVER_PROVIDER,
    ...(event.failure ? { failure: event.failure } : {}),
    kind: event.kind,
    ...(providerThreadId ? { providerThreadId } : {}),
    ...(event.text !== undefined ? { text: event.text } : {}),
    ...(turn.turnId ? { turnId: turn.turnId } : {})
  });
}

export function handleTurnStarted(message: JsonRpcMessage, turn: TurnState) {
  const turnId = readNestedString(message.params, ['turn', 'id']);
  if (turnId) turn.turnId = turnId;
  emitCodexAppServerTurnEvent(turn, { kind: 'started' });
}

export function handleTurnDelta(message: JsonRpcMessage, turn: TurnState) {
  turn.text += readDeltaText(message.params);
  emitCodexAppServerTurnEvent(turn, { kind: 'delta', text: turn.text });
}
