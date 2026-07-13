import readline from 'node:readline';

import type { NativeAssistantFailureCategory } from '../../lib/platform/nativeAssistantContract.js';
import { appendMainProcessDiagnosticLog } from '../diagnostics/mainProcessDiagnostics.js';

import { createInitializeMessage, mapJsonRpcError, parseMessage, type JsonRpcMessage } from './codexAppServerProtocol.js';
import type { SpawnedCodexProcess } from './codexAppServerSessionTypes.js';

const ACCOUNT_TIMEOUT_MS = 15_000;
const LOGIN_TIMEOUT_MS = 5 * 60_000;

export type CodexAccountState = 'authenticated' | 'unauthenticated';

export async function readCodexAccountState(args: AccountClientArgs): Promise<CodexAccountState> {
  return runAccountClient(args, (client) => client.readAccount());
}

export async function loginCodexWithChatGpt(args: AccountClientArgs & {
  openExternal: (url: string) => Promise<unknown>;
}) {
  return runAccountClient(args, (client) => client.loginWithChatGpt(args.openExternal), LOGIN_TIMEOUT_MS);
}

interface AccountClientArgs {
  appVersion: string;
  spawn: () => SpawnedCodexProcess;
}

async function runAccountClient<T>(
  args: AccountClientArgs,
  operation: (client: AccountClient) => Promise<T>,
  timeoutMs = ACCOUNT_TIMEOUT_MS
) {
  const client = new AccountClient(args, timeoutMs);
  try {
    await client.initialize();
    return await operation(client);
  } finally {
    client.dispose();
  }
}

class AccountClient {
  private readonly child: SpawnedCodexProcess;
  private disposing = false;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly reader: readline.Interface;
  private loginCompleted: PendingLogin | null = null;
  private nextId = 1;
  private stderrTail = '';

  constructor(private readonly args: AccountClientArgs, private readonly timeoutMs: number) {
    this.child = args.spawn();
    this.reader = readline.createInterface({ input: this.child.stdout });
    this.reader.on('line', (line) => this.handleLine(line));
    this.child.stderr.on('data', (chunk) => {
      this.stderrTail = `${this.stderrTail}${String(chunk)}`.slice(-2_048);
    });
    this.child.on('error', (error) => {
      this.logUnexpectedExit('error', error);
      this.failAll('launch_failed');
    });
    this.child.on('exit', (code, signal) => {
      this.logUnexpectedExit('exit', { code, signal });
      this.failAll('interrupted');
    });
  }

  async initialize() {
    await this.request(createInitializeMessage(this.args.appVersion));
    this.write({ method: 'initialized', params: {} });
  }

  async readAccount(): Promise<CodexAccountState> {
    const result = await this.request({ method: 'account/read', params: { refreshToken: false } });
    return result.account || result.requiresOpenaiAuth === false ? 'authenticated' : 'unauthenticated';
  }

  async loginWithChatGpt(openExternal: (url: string) => Promise<unknown>) {
    const result = await this.request({
      method: 'account/login/start',
      params: { appBrand: 'chatgpt', type: 'chatgpt', useHostedLoginSuccessPage: true }
    });
    const authUrl = readTrustedAuthUrl(result.authUrl);
    const completed = this.waitForLoginCompletion();
    await openExternal(authUrl);
    await completed;
  }

  dispose() {
    this.disposing = true;
    this.failAll('interrupted');
    this.reader.close();
    this.child.removeAllListeners?.();
    this.child.stdin.end?.();
    this.child.kill();
  }

  private logUnexpectedExit(kind: 'error' | 'exit', detail: unknown) {
    if (this.disposing) return;
    appendMainProcessDiagnosticLog('codex_app_server_account_process_ended', {
      detail,
      kind,
      stderrTail: this.stderrTail
    });
  }

  private request(message: JsonRpcMessage) {
    const id = message.id ?? this.nextId++;
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(Number(id));
        reject(categorizedError('timeout'));
      }, this.timeoutMs);
      this.pending.set(Number(id), { reject, resolve, timeout });
      this.write({ ...message, id });
    });
  }

  private waitForLoginCompletion() {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.loginCompleted = null;
        reject(categorizedError('timeout'));
      }, this.timeoutMs);
      this.loginCompleted = { reject, resolve, timeout };
    });
  }

  private handleLine(line: string) {
    const parsed = parseMessage(line);
    if (!parsed.ok) return this.failAll('protocol_error');
    const { message } = parsed;
    if (typeof message.id === 'number') return this.handleResponse(message);
    if (message.method === 'account/login/completed') this.handleLoginCompleted(message);
  }

  private handleResponse(message: JsonRpcMessage) {
    const pending = this.pending.get(Number(message.id));
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pending.delete(Number(message.id));
    if (message.error) pending.reject(categorizedError(mapJsonRpcError(message.error)));
    else pending.resolve(message.result ?? {});
  }

  private handleLoginCompleted(message: JsonRpcMessage) {
    const pending = this.loginCompleted;
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.loginCompleted = null;
    if (message.params?.success === true) pending.resolve();
    else pending.reject(categorizedError('auth_failed'));
  }

  private failAll(category: NativeAssistantFailureCategory) {
    const error = categorizedError(category);
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
    if (this.loginCompleted) {
      clearTimeout(this.loginCompleted.timeout);
      this.loginCompleted.reject(error);
      this.loginCompleted = null;
    }
  }

  private write(message: JsonRpcMessage) {
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }
}

interface PendingRequest {
  reject: (error: Error) => void;
  resolve: (result: Record<string, unknown>) => void;
  timeout: NodeJS.Timeout;
}

interface PendingLogin {
  reject: (error: Error) => void;
  resolve: () => void;
  timeout: NodeJS.Timeout;
}

function readTrustedAuthUrl(value: unknown) {
  if (typeof value !== 'string') throw categorizedError('protocol_error');
  const url = new URL(value);
  const trustedHost = url.hostname === 'chatgpt.com' ||
    url.hostname.endsWith('.chatgpt.com') ||
    url.hostname === 'openai.com' ||
    url.hostname.endsWith('.openai.com');
  if (url.protocol !== 'https:' || !trustedHost) throw categorizedError('protocol_error');
  return url.toString();
}

function categorizedError(category: NativeAssistantFailureCategory) {
  const error = new Error(category) as Error & { category?: NativeAssistantFailureCategory };
  error.category = category;
  return error;
}
