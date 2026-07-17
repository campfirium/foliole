import fs from 'node:fs';

import type {
  NativeAssistantSendMessageResult,
  NativeAssistantTurnEvent,
  NativeAssistantWorkspaceContext,
  NativeAssistantStatusResult
} from '../../lib/platform/nativeAssistantContract.js';

import {
  loginCodexWithChatGpt,
  readCodexAccountState,
  type CodexAccountState
} from './codexAppServerAccount.js';
import {
  categorizedError,
  createAssistantFailure,
  createAssistantStatus,
  failureFromError,
  normalizeOptionalThreadId,
  sanitizeCodexLauncherEnv
} from './codexAppServerAdapterSupport.js';
import {
  CODEX_APP_SERVER_ARGS,
  findCodexCommandCandidates,
  probeCodexCommand,
  spawnCodexCommand,
  type CodexLauncherOptions
} from './codexAppServerCommandDiscovery.js';
import {
  executeFolioleDynamicTool,
  type FolioleDynamicToolRequest
} from './codexAppServerDynamicTools.js';
import type { SpawnedCodexProcess } from './codexAppServerSessionTypes.js';
import { CodexAppServerSession } from './codexAppServerTurn.js';

const DEFAULT_TIMEOUT_MS = 180_000;

export interface CodexAppServerAdapterOptions {
  appVersion: string;
  command?: string;
  findCommandCandidates?: (env: NodeJS.ProcessEnv) => Promise<string[]>;
  env?: NodeJS.ProcessEnv;
  executeDynamicTool?: (request: FolioleDynamicToolRequest) => ReturnType<typeof executeFolioleDynamicTool>;
  launcherCwd: string;
  loginWithChatGpt?: (options: {
    appVersion: string;
    openExternal: (url: string) => Promise<unknown>;
    spawn: () => SpawnedCodexProcess;
  }) => Promise<void>;
  mkdirSync?: (path: string, options: { recursive: true }) => void;
  probeCommand?: (command: string, options: CodexLauncherOptions) => Promise<boolean>;
  openExternal?: (url: string) => Promise<unknown>;
  readAccountState?: (options: {
    appVersion: string;
    spawn: () => SpawnedCodexProcess;
  }) => Promise<CodexAccountState>;
  spawnCommand?: (
    command: string,
    args: string[],
    options: CodexLauncherOptions
  ) => SpawnedCodexProcess;
  timeoutMs?: number;
  trustConfiguredCommand?: boolean;
}

export class CodexAppServerAdapter {
  private active = false;
  private readonly appVersion: string;
  private readonly configuredCommand: string | undefined;
  private readonly env: NodeJS.ProcessEnv;
  private readonly executeDynamicTool: NonNullable<CodexAppServerAdapterOptions['executeDynamicTool']>;
  private readonly findCommandCandidates: (env: NodeJS.ProcessEnv) => Promise<string[]>;
  private readonly launcherCwd: string;
  private readonly loginWithChatGpt: NonNullable<CodexAppServerAdapterOptions['loginWithChatGpt']>;
  private readonly mkdirSync: (path: string, options: { recursive: true }) => void;
  private readonly probeCommand: (
    command: string,
    options: CodexLauncherOptions
  ) => Promise<boolean>;
  private readonly openExternal: (url: string) => Promise<unknown>;
  private readonly readAccountState: NonNullable<CodexAppServerAdapterOptions['readAccountState']>;
  private resolvedCommand: string | null = null;
  private session: CodexAppServerSession | null = null;
  private readonly spawnCommand: (
    command: string,
    args: string[],
    options: CodexLauncherOptions
  ) => SpawnedCodexProcess;
  private readonly timeoutMs: number;
  private readonly trustConfiguredCommand: boolean;

  constructor(options: CodexAppServerAdapterOptions) {
    this.appVersion = options.appVersion;
    this.configuredCommand = options.command;
    this.env = options.env ?? process.env;
    this.executeDynamicTool = options.executeDynamicTool ?? executeFolioleDynamicTool;
    this.findCommandCandidates = options.findCommandCandidates ?? findCodexCommandCandidates;
    this.launcherCwd = options.launcherCwd;
    this.loginWithChatGpt = options.loginWithChatGpt ?? loginCodexWithChatGpt;
    this.mkdirSync = options.mkdirSync ?? fs.mkdirSync;
    this.probeCommand = options.probeCommand ?? probeCodexCommand;
    this.openExternal = options.openExternal ?? (async () => {
      throw categorizedError('launch_failed');
    });
    this.readAccountState = options.readAccountState ?? readCodexAccountState;
    this.spawnCommand = options.spawnCommand ?? spawnCodexCommand;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.trustConfiguredCommand = options.trustConfiguredCommand === true;
  }

  async getStatus(): Promise<NativeAssistantStatusResult> {
    if (this.active) return createAssistantStatus('busy');
    try {
      const launcherOptions = this.createLauncherOptions();
      const command = await this.resolveCommand(launcherOptions);
      if (!command) return createAssistantStatus('unavailable', 'not_configured');
      const accountState = await this.readAccountState({
        appVersion: this.appVersion,
        spawn: () => this.spawnCommand(command, CODEX_APP_SERVER_ARGS, launcherOptions)
      });
      if (accountState === 'unauthenticated') return createAssistantStatus('unavailable', 'auth_failed');
      return createAssistantStatus('ready');
    } catch (error) {
      return createAssistantStatus('unavailable', failureFromError(error));
    }
  }

  async startChatGptLogin() {
    if (this.active) return createAssistantFailure('busy', 'busy');
    this.active = true;
    try {
      const launcherOptions = this.createLauncherOptions();
      const command = await this.resolveCommand(launcherOptions);
      if (!command) return createAssistantFailure('failed', 'not_configured');
      this.session?.dispose();
      this.session = null;
      await this.loginWithChatGpt({
        appVersion: this.appVersion,
        openExternal: this.openExternal,
        spawn: () => this.spawnCommand(command, CODEX_APP_SERVER_ARGS, launcherOptions)
      });
      return { provider: 'codex-app-server' as const, state: 'ready' as const };
    } catch (error) {
      return createAssistantFailure('failed', failureFromError(error));
    } finally {
      this.active = false;
    }
  }

  async sendMessage(input: {
    clientTurnId: string;
    message: string;
    onEvent?: (event: NativeAssistantTurnEvent) => void;
    providerThreadId?: string;
    workspaceContext?: NativeAssistantWorkspaceContext;
  }): Promise<NativeAssistantSendMessageResult> {
    if (this.active) return createAssistantFailure('busy', 'busy');
    const message = input.message.trim();
    const providerThreadId = normalizeOptionalThreadId(input.providerThreadId);
    if (!message) return createAssistantFailure('failed', 'protocol_error');
    this.active = true;
    try {
      const command = this.resolvedCommand
        ?? this.configuredCommand
        ?? await this.resolveCommand(this.createLauncherOptions());
      if (!command) return createAssistantFailure('failed', 'not_configured');
      this.session ??= new CodexAppServerSession({
        appVersion: this.appVersion,
        executeDynamicTool: this.executeDynamicTool,
        launcherCwd: this.launcherCwd,
        spawn: () => this.spawnCommand(command, CODEX_APP_SERVER_ARGS, this.createLauncherOptions())
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
      return createAssistantFailure('failed', failureFromError(error));
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
      const codexHome = this.env.CODEX_HOME?.trim();
      if (this.trustConfiguredCommand && codexHome) {
        this.mkdirSync(codexHome, { recursive: true });
      }
    } catch {
      throw categorizedError('launch_failed');
    }
    return {
      cwd: this.launcherCwd,
      env: sanitizeCodexLauncherEnv(this.env)
    };
  }

  private async resolveCommand(options: CodexLauncherOptions) {
    if (this.resolvedCommand) return this.resolvedCommand;
    if (this.configuredCommand && this.trustConfiguredCommand) {
      this.resolvedCommand = this.configuredCommand;
      return this.configuredCommand;
    }
    const candidates = this.configuredCommand
      ? [this.configuredCommand]
      : await this.findCommandCandidates(this.env);
    for (const command of candidates) {
      if (!await this.probeCommand(command, options)) continue;
      this.resolvedCommand = command;
      return command;
    }
    return null;
  }
}
