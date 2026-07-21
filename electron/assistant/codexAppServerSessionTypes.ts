import type {
  NativeAssistantSendMessageResult,
  NativeAssistantTurnEvent
} from '../../lib/platform/nativeAssistantContract.js';

import type { AssistantContinuationMessage } from './codexAppServerThreadHistory.js';

export interface SpawnedCodexProcess {
  kill: () => void;
  on: (event: 'error' | 'exit', listener: (...args: unknown[]) => void) => unknown;
  removeAllListeners?: () => unknown;
  stderr: NodeJS.ReadableStream;
  stdin: NodeJS.WritableStream;
  stdout: NodeJS.ReadableStream;
}

export interface TurnState {
  clientTurnId: string;
  continuationMessages?: AssistantContinuationMessage[];
  dynamicToolCapabilities: string[];
  finish: (result: NativeAssistantSendMessageResult) => void;
  historyInjectRequestId?: number;
  imagePaths?: string[];
  onEvent?: (event: NativeAssistantTurnEvent) => void;
  providerThreadId?: string;
  text: string;
  threadId: string | null;
  threadRequestId: number;
  timeout: NodeJS.Timeout;
  timeoutMs: number;
  turnId?: string;
  userMessage: string;
}
