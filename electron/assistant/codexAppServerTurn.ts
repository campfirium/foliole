import readline from 'node:readline';

import type {
  NativeAssistantFailureCategory,
  NativeAssistantSendMessageResult,
  NativeAssistantTurnEvent,
  NativeAssistantWorkspaceContext
} from '../../lib/platform/nativeAssistantContract.js';

import { createAideThreadRequest, createAideTurnStartParams } from './codexAppServerAidePolicy.js';
import {
  CODEX_APP_SERVER_PROVIDER,
  composeAssistantTurnInput,
  createInitializeMessage,
  mapAppServerEventError,
  mapJsonRpcError,
  parseMessage,
  readDeltaText,
  readNestedString,
  sendFailure,
  type JsonRpcMessage
} from './codexAppServerProtocol.js';
import type { SpawnedCodexProcess, TurnState } from './codexAppServerSessionTypes.js';
import { CodexAppServerTurnDiagnostics } from './codexAppServerTurnDiagnostics.js';
import { emitCodexAppServerTurnEvent } from './codexAppServerTurnEvents.js';

export class CodexAppServerSession {
  private activeTurn: TurnState | null = null;
  private child: SpawnedCodexProcess | null = null;
  private initialized: Promise<void> | null = null;
  private initializedReject: ((error: Error & { category?: NativeAssistantFailureCategory }) => void) | null = null;
  private initializeId = 0;
  private initializedResolve: (() => void) | null = null;
  private nextId = 1;
  private rl: readline.Interface | null = null;
  private readonly diagnostics = new CodexAppServerTurnDiagnostics();
  constructor(
    private readonly args: {
      appVersion: string;
      launcherCwd: string;
      spawn: () => SpawnedCodexProcess;
    }
  ) {}
  async sendMessage(args: {
    clientTurnId: string;
    message: string;
    workspaceContext?: NativeAssistantWorkspaceContext;
    providerThreadId?: string;
    timeoutMs: number;
    onEvent?: (event: NativeAssistantTurnEvent) => void;
  }): Promise<NativeAssistantSendMessageResult> {
    if (this.activeTurn) return sendFailure('busy', 'busy');
    const initializeTimeout = setTimeout(() => this.failActiveTurn('timeout', true), args.timeoutMs);
    try {
      await this.ensureInitialized();
    } finally {
      clearTimeout(initializeTimeout);
    }
    return new Promise((resolve) => {
      const timeout = setTimeout(() => this.failActiveTurn('timeout', true), args.timeoutMs);
      const threadRequestId = this.nextId++;
      this.activeTurn = {
        clientTurnId: args.clientTurnId,
        finish: resolve,
        ...(args.onEvent ? { onEvent: args.onEvent } : {}),
        ...(args.providerThreadId ? { providerThreadId: args.providerThreadId } : {}),
        text: '',
        threadId: null,
        threadRequestId,
        timeout,
        userMessage: composeAssistantTurnInput(args.message, args.workspaceContext)
      };
      this.write(createAideThreadRequest(threadRequestId, this.args.launcherCwd, args.providerThreadId));
    });
  }

  dispose() {
    const child = this.child;
    this.activeTurn = null;
    this.initialized = null;
    this.initializedResolve = null;
    this.initializedReject = null;
    this.rl?.close();
    this.rl = null;
    this.child = null;
    child?.removeAllListeners?.();
    child?.stdin.end?.();
    child?.kill();
  }
  private ensureInitialized() {
    if (this.initialized) return this.initialized;
    this.child = this.args.spawn();
    this.diagnostics.attach(this.child, {
      onError: () => this.failActiveTurn('not_configured', true),
      onExit: (code) => {
        this.failActiveTurn(code === 0 ? 'interrupted' : 'launch_failed', false);
        this.resetSession(false);
      }
    });
    this.rl = readline.createInterface({ input: this.child.stdout });
    this.rl.on('line', (line) => this.handleLine(line));
    this.initialized = new Promise((resolve, reject) => {
      this.initializedResolve = resolve;
      this.initializedReject = reject;
      this.write(createInitializeMessage(this.args.appVersion));
    });
    return this.initialized;
  }
  private handleLine(line: string) {
    const parsed = parseMessage(line);
    if (!parsed.ok) {
      this.failActiveTurn('protocol_error', true);
      return;
    }
    this.handleMessage(parsed.message);
  }
  private handleMessage(message: JsonRpcMessage) {
    if (message.error) {
      this.diagnostics.logProtocolError(message.error);
      this.failActiveTurn(mapJsonRpcError(message.error), true);
      return;
    }
    if (message.id === this.initializeId) {
      this.write({ method: 'initialized', params: {} });
      this.initializedResolve?.();
      this.initializedResolve = null;
      this.initializedReject = null;
      return;
    }
    const turn = this.activeTurn;
    if (!turn) return;
    if (message.id === turn.threadRequestId) this.handleThreadReady(message, turn);
    else if (message.method === 'turn/started') this.handleTurnStarted(message, turn);
    else if (message.method === 'error') {
      const category = mapAppServerEventError(message.params);
      if (category) this.failActiveTurn(category, true);
    } else if (message.method === 'item/agentMessage/delta') this.handleDelta(message, turn);
    else if (message.method === 'turn/completed') this.finishTurn(turn);
  }
  private handleThreadReady(message: JsonRpcMessage, turn: TurnState) {
    const threadId = readNestedString(message.result, ['thread', 'id']);
    if (!threadId || (turn.providerThreadId && threadId !== turn.providerThreadId)) {
      this.failActiveTurn('protocol_error', true);
      return;
    }
    turn.threadId = threadId;
    emitCodexAppServerTurnEvent(turn, { kind: 'started', providerThreadId: threadId });
    this.write({
      id: this.nextId++,
      method: 'turn/start',
      params: createAideTurnStartParams(this.args.launcherCwd, threadId, turn.userMessage)
    });
  }
  private handleTurnStarted(message: JsonRpcMessage, turn: TurnState) {
    const turnId = readNestedString(message.params, ['turn', 'id']);
    if (turnId) turn.turnId = turnId;
    emitCodexAppServerTurnEvent(turn, { kind: 'started' });
  }
  private handleDelta(message: JsonRpcMessage, turn: TurnState) {
    turn.text += readDeltaText(message.params);
    emitCodexAppServerTurnEvent(turn, { kind: 'delta', text: turn.text });
  }
  private finishTurn(turn: TurnState) {
    if (!turn.text.trim()) {
      this.failActiveTurn('protocol_error', true);
      return;
    }
    const result = {
      message: {
        text: turn.text,
        ...(turn.threadId ? { threadId: turn.threadId } : {}),
        ...(turn.turnId ? { turnId: turn.turnId } : {})
      },
      provider: CODEX_APP_SERVER_PROVIDER,
      state: 'ready'
    } satisfies NativeAssistantSendMessageResult;
    emitCodexAppServerTurnEvent(turn, { kind: 'completed', text: turn.text });
    this.finishActiveTurn(result);
  }

  private failActiveTurn(category: NativeAssistantFailureCategory, dispose: boolean) {
    if (!this.activeTurn && this.initializedReject) {
      const error = new Error(category) as Error & { category?: NativeAssistantFailureCategory };
      error.category = category;
      this.initializedReject(error);
      this.initializedReject = null;
      if (dispose) this.dispose();
      return;
    }
    const result = sendFailure('failed', category);
    if (this.activeTurn) emitCodexAppServerTurnEvent(this.activeTurn, { failure: result.failure, kind: 'failed' });
    this.finishActiveTurn(result);
    if (dispose) this.dispose();
  }
  private finishActiveTurn(result: NativeAssistantSendMessageResult) {
    const turn = this.activeTurn;
    if (!turn) return;
    clearTimeout(turn.timeout);
    this.activeTurn = null;
    turn.finish(result);
  }
  private resetSession(kill: boolean) {
    const child = this.child;
    this.initialized = null;
    this.initializedResolve = null;
    this.initializedReject = null;
    this.rl?.close();
    this.rl = null;
    this.child = null;
    child?.removeAllListeners?.();
    if (kill) child?.kill();
  }
  private write(message: JsonRpcMessage) {
    try {
      this.child?.stdin.write(`${JSON.stringify(message)}\n`);
    } catch {
      this.failActiveTurn('protocol_error', true);
    }
  }

}
