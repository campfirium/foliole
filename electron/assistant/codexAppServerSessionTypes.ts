import type {
  NativeAssistantSendMessageResult,
  NativeAssistantTurnEvent
} from '../../lib/platform/nativeAssistantContract.js';

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
  finish: (result: NativeAssistantSendMessageResult) => void;
  onEvent?: (event: NativeAssistantTurnEvent) => void;
  providerThreadId?: string;
  text: string;
  threadId: string | null;
  threadRequestId: number;
  timeout: NodeJS.Timeout;
  turnId?: string;
  userMessage: string;
}
