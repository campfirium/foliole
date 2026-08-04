import { createAideTurnStartParams } from './codexAppServerAidePolicy.js';
import { readNestedString, type JsonRpcMessage } from './codexAppServerProtocol.js';
import type { TurnState } from './codexAppServerSessionTypes.js';
import { createThreadHistoryItems } from './codexAppServerThreadHistory.js';
import { emitCodexAppServerTurnEvent } from './codexAppServerTurnEvents.js';

interface ThreadContinuationSequenceArgs {
  allocateId: () => number;
  launcherCwd: string;
  message: JsonRpcMessage;
  onProtocolError: () => void;
  turn: TurnState;
  write: (message: JsonRpcMessage) => void;
}

export function handleThreadContinuationSequence(args: ThreadContinuationSequenceArgs) {
  const threadId = readNestedString(args.message.result, ['thread', 'id']);
  if (!threadId || (args.turn.providerThreadId && threadId !== args.turn.providerThreadId)) {
    args.onProtocolError();
    return;
  }
  args.turn.threadId = threadId;
  emitCodexAppServerTurnEvent(args.turn, { kind: 'started', providerThreadId: threadId });
  if (!args.turn.continuationMessages?.length) {
    startContinuedTurn(args);
    return;
  }
  args.turn.historyInjectRequestId = args.allocateId();
  args.write({
    id: args.turn.historyInjectRequestId,
    method: 'thread/inject_items',
    params: { items: createThreadHistoryItems(args.turn.continuationMessages), threadId }
  });
}

export function startContinuedTurn(args: Omit<ThreadContinuationSequenceArgs, 'message'>) {
  if (!args.turn.threadId) {
    args.onProtocolError();
    return;
  }
  args.write({
    id: args.allocateId(),
    method: 'turn/start',
    params: createAideTurnStartParams(
      args.launcherCwd,
      args.turn.threadId,
      args.turn.userMessage,
      args.turn.imagePaths ?? [],
      args.turn.modelSelection
    )
  });
}
