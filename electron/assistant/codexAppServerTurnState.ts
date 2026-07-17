import type {
  NativeAssistantSendMessageResult,
  NativeAssistantTurnEvent,
  NativeAssistantWorkspaceContext
} from '../../lib/platform/nativeAssistantContract.js';

import { resolveDynamicToolCapabilities } from './codexAppServerDynamicTools.js';
import { composeAssistantTurnInput } from './codexAppServerProtocol.js';
import type { TurnState } from './codexAppServerSessionTypes.js';

export interface SendMessageArgs {
  clientTurnId: string;
  message: string;
  onEvent?: (event: NativeAssistantTurnEvent) => void;
  providerThreadId?: string;
  timeoutMs: number;
  workspaceContext?: NativeAssistantWorkspaceContext;
}

export function createTurnState(
  args: SendMessageArgs,
  threadRequestId: number,
  finish: (result: NativeAssistantSendMessageResult) => void,
  onTimeout: () => void
): TurnState {
  return {
    clientTurnId: args.clientTurnId,
    dynamicToolCapabilities: resolveDynamicToolCapabilities(args.workspaceContext),
    finish,
    ...(args.onEvent ? { onEvent: args.onEvent } : {}),
    ...(args.providerThreadId ? { providerThreadId: args.providerThreadId } : {}),
    text: '',
    threadId: null,
    threadRequestId,
    timeout: setTimeout(onTimeout, args.timeoutMs),
    timeoutMs: args.timeoutMs,
    userMessage: composeAssistantTurnInput(args.message, args.workspaceContext)
  };
}
