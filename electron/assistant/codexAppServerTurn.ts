import readline from 'node:readline';

import type {
  NativeAssistantFailureCategory,
  NativeAssistantSendMessageResult
} from '../../lib/platform/nativeAssistantContract.js';

const PROVIDER = 'codex-app-server' as const;

type JsonRpcRecord = Record<string, unknown>;

interface JsonRpcMessage {
  error?: { code?: number; message?: string };
  id?: number;
  method?: string;
  params?: JsonRpcRecord;
  result?: JsonRpcRecord;
}

export interface SpawnedCodexProcess {
  kill: () => void;
  on: (event: 'error' | 'exit', listener: (...args: unknown[]) => void) => unknown;
  stderr: NodeJS.ReadableStream;
  stdin: NodeJS.WritableStream;
  stdout: NodeJS.ReadableStream;
}

interface TurnState {
  finish: (result: NativeAssistantSendMessageResult) => void;
  providerThreadId?: string;
  send: (message: JsonRpcMessage) => void;
  text: string;
  threadId: string | null;
  turnId?: string;
  userMessage: string;
}

export async function runCodexAppServerTurn(args: {
  appVersion: string;
  child: SpawnedCodexProcess;
  message: string;
  providerThreadId?: string;
  timeoutMs: number;
}): Promise<NativeAssistantSendMessageResult> {
  return new Promise((resolve) => {
    let settled = false;
    const rl = readline.createInterface({ input: args.child.stdout });
    const timeout = setTimeout(() => finish(sendFailure('failed', 'timeout')), args.timeoutMs);
    const finish = (result: NativeAssistantSendMessageResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      rl.close();
      args.child.kill();
      resolve(result);
    };
    const state: TurnState = {
      finish,
      ...(args.providerThreadId ? { providerThreadId: args.providerThreadId } : {}),
      send: (message) => args.child.stdin.write(`${JSON.stringify(message)}\n`),
      text: '',
      threadId: null,
      userMessage: args.message
    };
    args.child.on('error', () => finish(sendFailure('failed', 'not_configured')));
    args.child.on('exit', (code) => {
      if (!settled && code !== 0) finish(sendFailure('failed', 'launch_failed'));
    });
    rl.on('line', (line) => handleLine(line, state));
    state.send(createInitializeMessage(args.appVersion));
  });
}

function createInitializeMessage(appVersion: string): JsonRpcMessage {
  return {
    id: 0,
    method: 'initialize',
    params: {
      clientInfo: { name: 'foliole_desktop', title: 'Foliole Desktop', version: appVersion }
    }
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
  else if (message.id === 1) handleThreadReady(message, state);
  else if (message.method === 'turn/started') {
    const turnId = readNestedString(message.params, ['turn', 'id']);
    if (turnId) state.turnId = turnId;
  } else if (message.method === 'item/agentMessage/delta')
    state.text += readDeltaText(message.params);
  else if (message.method === 'turn/completed') finishTurn(state);
}

function handleInitialized(state: TurnState) {
  state.send({ method: 'initialized', params: {} });
  state.send(
    state.providerThreadId
      ? { id: 1, method: 'thread/resume', params: { threadId: state.providerThreadId } }
      : { id: 1, method: 'thread/start', params: {} }
  );
}

function handleThreadReady(message: JsonRpcMessage, state: TurnState) {
  state.threadId = readNestedString(message.result, ['thread', 'id']);
  if (!state.threadId || (state.providerThreadId && state.threadId !== state.providerThreadId)) {
    state.finish(sendFailure('failed', 'protocol_error'));
    return;
  }
  state.send({
    id: 2,
    method: 'turn/start',
    params: { input: [{ text: state.userMessage, type: 'text' }], threadId: state.threadId }
  });
}

function finishTurn(state: TurnState) {
  state.finish({
    message: {
      text: state.text,
      ...(state.threadId ? { threadId: state.threadId } : {}),
      ...(state.turnId ? { turnId: state.turnId } : {})
    },
    provider: PROVIDER,
    state: 'ready'
  });
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
  for (const key of path)
    value = typeof value === 'object' && value ? (value as JsonRpcRecord)[key] : undefined;
  return typeof value === 'string' ? value : null;
}

function readDeltaText(params: JsonRpcRecord | undefined) {
  return typeof params?.delta === 'string'
    ? params.delta
    : typeof params?.text === 'string'
      ? params.text
      : '';
}

function mapJsonRpcError(error: {
  code?: number;
  message?: string;
}): NativeAssistantFailureCategory {
  if (error.code === -32001 || error.message?.toLowerCase().includes('overloaded'))
    return 'overloaded';
  if (error.message?.toLowerCase().includes('auth')) return 'auth_failed';
  return 'protocol_error';
}

function sendFailure(
  state: NativeAssistantSendMessageResult['state'],
  category: NativeAssistantFailureCategory
) {
  return {
    failure: { category },
    provider: PROVIDER,
    state
  } satisfies NativeAssistantSendMessageResult;
}
