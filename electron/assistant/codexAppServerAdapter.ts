import { spawn } from 'node:child_process';

import type {
  NativeAssistantFailureCategory,
  NativeAssistantSendMessageResult,
  NativeAssistantTurnEvent,
  NativeAssistantStatusResult
} from '../../lib/platform/nativeAssistantContract.js';

import type { SpawnedCodexProcess } from './codexAppServerSessionTypes.js';
import { CodexAppServerSession } from './codexAppServerTurn.js';

const PROVIDER = 'codex-app-server' as const;
const DEFAULT_TIMEOUT_MS = 45_000;

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
  private session: CodexAppServerSession | null = null;
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
    return (await this.probeCommand(this.command))
      ? status('ready')
      : status('unavailable', 'not_configured');
  }

  async sendMessage(input: {
    clientTurnId: string;
    message: string;
    onEvent?: (event: NativeAssistantTurnEvent) => void;
    providerThreadId?: string;
  }): Promise<NativeAssistantSendMessageResult> {
    if (this.active) return sendFailure('busy', 'busy');
    const message = input.message.trim();
    const providerThreadId = normalizeOptionalThreadId(input.providerThreadId);
    if (!message) return sendFailure('failed', 'protocol_error');
    this.active = true;
    try {
      this.session ??= new CodexAppServerSession({
        appVersion: this.appVersion,
        spawn: () => this.spawnCommand(this.command, ['app-server'])
      });
      return await this.session.sendMessage({
        clientTurnId: input.clientTurnId,
        message,
        ...(input.onEvent ? { onEvent: input.onEvent } : {}),
        ...(providerThreadId ? { providerThreadId } : {}),
        timeoutMs: this.timeoutMs
      });
    } catch (error) {
      return sendFailure('failed', failureFromError(error));
    } finally {
      this.active = false;
    }
  }

  dispose() {
    this.session?.dispose();
    this.session = null;
    this.active = false;
  }
}

function status(
  state: NativeAssistantStatusResult['state'],
  category?: NativeAssistantFailureCategory
) {
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

function normalizeOptionalThreadId(value: string | undefined) {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (!normalized) throw new Error('invalid_provider_thread_id');
  return normalized;
}

function failureFromError(error: unknown): NativeAssistantFailureCategory {
  if (error && typeof error === 'object' && 'category' in error) {
    const category = error.category;
    if (typeof category === 'string') return category as NativeAssistantFailureCategory;
  }
  return error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'
    ? 'not_configured'
    : 'internal_error';
}
