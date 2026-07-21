import type {
  NativeAssistantSendMessageResult,
  NativeAssistantTurnEvent,
  NativeAssistantWorkspaceContext
} from '../../lib/platform/nativeAssistantContract.js';

import { resolveDynamicToolCapabilities } from './codexAppServerDynamicTools.js';
import { composeAssistantTurnInput } from './codexAppServerProtocol.js';
import type { TurnState } from './codexAppServerSessionTypes.js';
import type { AssistantContinuationMessage } from './codexAppServerThreadHistory.js';

export interface SendMessageArgs {
  clientTurnId: string;
  continuationMessages?: AssistantContinuationMessage[];
  imagePaths?: string[];
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
    ...(args.continuationMessages ? { continuationMessages: args.continuationMessages } : {}),
    dynamicToolCapabilities: resolveDynamicToolCapabilities(args.workspaceContext),
    finish,
    imagePaths: args.imagePaths ?? [],
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
