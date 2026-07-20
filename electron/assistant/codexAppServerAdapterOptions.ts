import type { CodexAccountState } from './codexAppServerAccount.js';
import type { CodexLauncherOptions } from './codexAppServerCommandDiscovery.js';
import type {
  DynamicToolCallResult,
  FolioleDynamicToolRequest
} from './codexAppServerDynamicTools.js';
import type { SpawnedCodexProcess } from './codexAppServerSessionTypes.js';

export interface CodexAppServerAdapterOptions {
  appVersion: string;
  command?: string;
  commandDiscoveryEnv?: NodeJS.ProcessEnv;
  developerInstructions?: string;
  findCommandCandidates?: (env: NodeJS.ProcessEnv) => Promise<string[]>;
  env?: NodeJS.ProcessEnv;
  executeDynamicTool?: (request: FolioleDynamicToolRequest) => Promise<DynamicToolCallResult>;
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
  skillRoots?: string[];
  spawnCommand?: (
    command: string,
    args: string[],
    options: CodexLauncherOptions
  ) => SpawnedCodexProcess;
  timeoutMs?: number;
  trustConfiguredCommand?: boolean;
}
