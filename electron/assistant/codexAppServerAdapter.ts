import { spawn } from 'node:child_process';
import fs from 'node:fs';

import type {
  NativeAssistantFailureCategory,
  NativeAssistantSendMessageResult,
  NativeAssistantTurnEvent,
  NativeAssistantWorkspaceContext,
  NativeAssistantStatusResult
} from '../../lib/platform/nativeAssistantContract.js';

import type { SpawnedCodexProcess } from './codexAppServerSessionTypes.js';
import { CodexAppServerSession } from './codexAppServerTurn.js';

const PROVIDER = 'codex-app-server' as const;
const DEFAULT_TIMEOUT_MS = 45_000;

export interface CodexAppServerAdapterOptions {
  appVersion: string;
  command?: string;
  env?: NodeJS.ProcessEnv;
  launcherCwd: string;
  mkdirSync?: (path: string, options: { recursive: true }) => void;
  probeCommand?: (command: string, options: CodexLauncherOptions) => Promise<boolean>;
  spawnCommand?: (
    command: string,
    args: string[],
    options: CodexLauncherOptions
  ) => SpawnedCodexProcess;
  timeoutMs?: number;
}

export interface CodexLauncherOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
}

export class CodexAppServerAdapter {
  private active = false;
  private readonly appVersion: string;
  private readonly command: string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly launcherCwd: string;
  private readonly mkdirSync: (path: string, options: { recursive: true }) => void;
  private readonly probeCommand: (
    command: string,
    options: CodexLauncherOptions
  ) => Promise<boolean>;
  private session: CodexAppServerSession | null = null;
  private readonly spawnCommand: (
    command: string,
    args: string[],
    options: CodexLauncherOptions
  ) => SpawnedCodexProcess;
  private readonly timeoutMs: number;

  constructor(options: CodexAppServerAdapterOptions) {
    this.appVersion = options.appVersion;
    this.command = options.command ?? 'codex';
    this.env = options.env ?? process.env;
    this.launcherCwd = options.launcherCwd;
    this.mkdirSync = options.mkdirSync ?? fs.mkdirSync;
    this.probeCommand = options.probeCommand ?? probeCodexCommand;
    this.spawnCommand = options.spawnCommand ?? spawnCodexCommand;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async getStatus(): Promise<NativeAssistantStatusResult> {
    if (this.active) return status('busy');
    try {
      return (await this.probeCommand(this.command, this.createLauncherOptions()))
        ? status('ready')
        : status('unavailable', 'not_configured');
    } catch (error) {
      return status('unavailable', failureFromError(error));
    }
  }

  async sendMessage(input: {
    clientTurnId: string;
    message: string;
    onEvent?: (event: NativeAssistantTurnEvent) => void;
    providerThreadId?: string;
    workspaceContext?: NativeAssistantWorkspaceContext;
  }): Promise<NativeAssistantSendMessageResult> {
    if (this.active) return sendFailure('busy', 'busy');
    const message = input.message.trim();
    const providerThreadId = normalizeOptionalThreadId(input.providerThreadId);
    if (!message) return sendFailure('failed', 'protocol_error');
    this.active = true;
    try {
      this.session ??= new CodexAppServerSession({
        appVersion: this.appVersion,
        spawn: () => this.spawnCommand(this.command, ['app-server'], this.createLauncherOptions())
      });
      return await this.session.sendMessage({
        clientTurnId: input.clientTurnId,
        message,
        ...(input.onEvent ? { onEvent: input.onEvent } : {}),
        ...(providerThreadId ? { providerThreadId } : {}),
        ...(input.workspaceContext ? { workspaceContext: input.workspaceContext } : {}),
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

  private createLauncherOptions(): CodexLauncherOptions {
    try {
      this.mkdirSync(this.launcherCwd, { recursive: true });
    } catch {
      throw categorizedError('launch_failed');
    }
    return {
      cwd: this.launcherCwd,
      env: sanitizeCodexLauncherEnv(this.env)
    };
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

async function probeCodexCommand(command: string, options: CodexLauncherOptions) {
  return new Promise<boolean>((resolve) => {
    const child = spawnCodexCommand(command, ['--version'], options);
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

function spawnCodexCommand(command: string, args: string[], options: CodexLauncherOptions) {
  return spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    shell: process.platform === 'win32',
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  });
}

function sanitizeCodexLauncherEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (isBlockedCodexEnvironmentKey(key)) continue;
    next[key] = value;
  }
  return next;
}

function isBlockedCodexEnvironmentKey(key: string) {
  const normalized = key.toUpperCase();
  return normalized.startsWith('CODEX_') && normalized !== 'CODEX_HOME';
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

function categorizedError(category: NativeAssistantFailureCategory) {
  const error = new Error(category) as Error & { category?: NativeAssistantFailureCategory };
  error.category = category;
  return error;
}
