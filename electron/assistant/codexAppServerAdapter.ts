import { spawn } from 'node:child_process';
import readline from 'node:readline';

import type {
  NativeAssistantFailureCategory,
  NativeAssistantSendMessageResult,
  NativeAssistantStatusResult
} from '../../lib/platform/nativeAssistantContract.js';

const PROVIDER = 'codex-app-server' as const;
const DEFAULT_TIMEOUT_MS = 45_000;

type JsonRpcRecord = Record<string, unknown>;

interface JsonRpcMessage {
  error?: { code?: number; message?: string };
  id?: number;
  method?: string;
  params?: JsonRpcRecord;
  result?: JsonRpcRecord;
}

interface SpawnedCodexProcess {
  kill: () => void;
  on: (event: 'error' | 'exit', listener: (...args: unknown[]) => void) => unknown;
  stderr: NodeJS.ReadableStream;
  stdin: NodeJS.WritableStream;
  stdout: NodeJS.ReadableStream;
}

interface TurnState {
  finish: (result: NativeAssistantSendMessageResult) => void;
  send: (message: JsonRpcMessage) => void;
  text: string;
  threadId: string | null;
  turnId?: string;
  userMessage: string;
}

export interface CodexAppServerAdapterOptions {
  appVersion: string;
  command?: string;
  probeCommand?: (command: string) => Promise<boolean>;
  spawnCommand?: (command: string, args: string[]) => SpawnedCodexProcess;
  timeoutMs?: number;
}

export class CodexAppServerAdapter {
  private active = false;
  private readonly appVersion: string;
  private readonly command: string;
  private readonly probeCommand: (command: string) => Promise<boolean>;
  private readonly spawnCommand: (command: string, args: string[]) => SpawnedCodexProcess;
  private readonly timeoutMs: number;

  constructor(options: CodexAppServerAdapterOptions) {
    this.appVersion = options.appVersion;
    this.command = options.command ?? 'codex';
    this.probeCommand = options.probeCommand ?? probeCodexCommand;
    this.spawnCommand = options.spawnCommand ?? spawnCodexCommand;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async getStatus(): Promise<NativeAssistantStatusResult> {
    if (this.active) return status('busy');
    return (await this.probeCommand(this.command)) ? status('ready') : status('unavailable', 'not_configured');
  }

  async sendMessage(input: { message: string }): Promise<NativeAssistantSendMessageResult> {
    if (this.active) return sendFailure('busy', 'busy');
    const message = input.message.trim();
    if (!message) return sendFailure('failed', 'protocol_error');
    this.active = true;
    try {
      return await runTurn(this.spawnCommand(this.command, ['app-server']), message, this.appVersion, this.timeoutMs);
    } catch (error) {
      return sendFailure('failed', failureFromError(error));
    } finally {
      this.active = false;
    }
  }
}

function status(state: NativeAssistantStatusResult['state'], category?: NativeAssistantFailureCategory) {
  return {
    capabilities: [
      { enabled: state === 'ready', name: 'sendMessage' as const },
      { enabled: true, name: 'status' as const },
      { enabled: state === 'ready', name: 'threadIndex' as const }
    ],
    ...(category ? { failure: { category } } : {}),
    provider: PROVIDER,
    state
  } satisfies NativeAssistantStatusResult;
}

function sendFailure(state: NativeAssistantSendMessageResult['state'], category: NativeAssistantFailureCategory) {
  return { failure: { category }, provider: PROVIDER, state } satisfies NativeAssistantSendMessageResult;
}

async function probeCodexCommand(command: string) {
  return new Promise<boolean>((resolve) => {
    const child = spawnCodexCommand(command, ['--version']);
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    child.on('error', () => finish(false));
    child.on('exit', (code) => finish(code === 0));
    setTimeout(() => {
      child.kill();
      finish(false);
    }, 2_000).unref?.();
  });
}

function spawnCodexCommand(command: string, args: string[]) {
  return spawn(command, args, {
    shell: process.platform === 'win32',
    stdio: ['pipe', 'pipe', 'pipe']
  });
}

async function runTurn(
  child: SpawnedCodexProcess,
  userMessage: string,
  appVersion: string,
  timeoutMs: number
): Promise<NativeAssistantSendMessageResult> {
  return new Promise((resolve) => {
    let settled = false;
    const rl = readline.createInterface({ input: child.stdout });
    const timeout = setTimeout(() => finish(sendFailure('failed', 'timeout')), timeoutMs);
    const finish = (result: NativeAssistantSendMessageResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      rl.close();
      child.kill();
      resolve(result);
    };
    const state: TurnState = { finish, send: (message) => child.stdin.write(`${JSON.stringify(message)}\n`), text: '', threadId: null, userMessage };
    child.on('error', () => finish(sendFailure('failed', 'not_configured')));
    child.on('exit', (code) => {
      if (!settled && code !== 0) finish(sendFailure('failed', 'launch_failed'));
    });
    rl.on('line', (line) => handleLine(line, state));
    state.send(createInitializeMessage(appVersion));
  });
}

function createInitializeMessage(appVersion: string): JsonRpcMessage {
  return {
    id: 0,
    method: 'initialize',
    params: { clientInfo: { name: 'foliole_desktop', title: 'Foliole Desktop', version: appVersion } }
  };
}

function handleLine(line: string, state: TurnState) {
  const parsed = parseMessage(line);
  if (!parsed.ok) {
    state.finish(sendFailure('failed', 'protocol_error'));
    return;
  }
  handleMessage(parsed.message, state);
}

function handleMessage(message: JsonRpcMessage, state: TurnState) {
  if (message.error) state.finish(sendFailure('failed', mapJsonRpcError(message.error)));
  else if (message.id === 0) handleInitialized(state);
  else if (message.id === 1) handleThreadStarted(message, state);
  else if (message.method === 'turn/started') {
    const turnId = readNestedString(message.params, ['turn', 'id']);
    if (turnId) state.turnId = turnId;
  }
  else if (message.method === 'item/agentMessage/delta') state.text += readDeltaText(message.params);
  else if (message.method === 'turn/completed') {
    state.finish({ message: { text: state.text, ...(state.threadId ? { threadId: state.threadId } : {}), ...(state.turnId ? { turnId: state.turnId } : {}) }, provider: PROVIDER, state: 'ready' });
  }
}

function handleInitialized(state: TurnState) {
  state.send({ method: 'initialized', params: {} });
  state.send({ id: 1, method: 'thread/start', params: {} });
}

function handleThreadStarted(message: JsonRpcMessage, state: TurnState) {
  state.threadId = readNestedString(message.result, ['thread', 'id']);
  if (!state.threadId) {
    state.finish(sendFailure('failed', 'protocol_error'));
    return;
  }
  state.send({ id: 2, method: 'turn/start', params: { input: [{ text: state.userMessage, type: 'text' }], threadId: state.threadId } });
}

function parseMessage(line: string): { message: JsonRpcMessage; ok: true } | { ok: false } {
  try {
    const message = JSON.parse(line) as JsonRpcMessage;
    return message && typeof message === 'object' ? { message, ok: true } : { ok: false };
  } catch {
    return { ok: false };
  }
}

function readNestedString(source: unknown, path: string[]) {
  let value = source;
  for (const key of path) value = typeof value === 'object' && value ? (value as JsonRpcRecord)[key] : undefined;
  return typeof value === 'string' ? value : null;
}

function readDeltaText(params: JsonRpcRecord | undefined) {
  return typeof params?.delta === 'string' ? params.delta : typeof params?.text === 'string' ? params.text : '';
}

function mapJsonRpcError(error: { code?: number; message?: string }): NativeAssistantFailureCategory {
  if (error.code === -32001 || error.message?.toLowerCase().includes('overloaded')) return 'overloaded';
  if (error.message?.toLowerCase().includes('auth')) return 'auth_failed';
  return 'protocol_error';
}

function failureFromError(error: unknown): NativeAssistantFailureCategory {
  return error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'
    ? 'not_configured'
    : 'internal_error';
}