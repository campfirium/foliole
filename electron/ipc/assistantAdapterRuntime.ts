import path from 'node:path';

import { app, shell } from 'electron';

import { resolveFolioleAppVersion } from '../appVersion.js';
import { CodexAppServerAdapter } from '../assistant/codexAppServerAdapter.js';
import {
  ensureFolioleAideAgentsFile,
  readFolioleAideDeveloperInstructions,
  resolveFolioleAideRuntimePaths
} from '../assistant/folioleAideRuntime.js';
import { OpenAiCompatibleAdapter } from '../assistant/openAiCompatibleAdapter.js';

import { resolveAssistantLauncherEnv } from './assistantLauncherEnvironment.js';
import { resolveBootstrapLibraryPaths } from './libraryPathBootstrap.js';

let adapter: CodexAppServerAdapter | null = null;
let byokAdapter: OpenAiCompatibleAdapter | null = null;

export function getAssistantAdapter() {
  const scriptRoot = resolveAssistantAgentControlScriptRoot();
  const packagedCommand = resolvePackagedMacosCodexCommand();
  const runtimePaths = resolveAssistantRuntimePaths(app.getPath('userData'), process.env);
  ensureFolioleAideAgentsFile(runtimePaths);
  adapter ??= new CodexAppServerAdapter({
    appVersion: resolveFolioleAppVersion(app),
    ...(packagedCommand ? { command: packagedCommand } : {}),
    commandDiscoveryEnv: process.env,
    developerInstructions: readFolioleAideDeveloperInstructions(runtimePaths),
    env: resolveAssistantEnvironment(scriptRoot, runtimePaths),
    openExternal: (url) => shell.openExternal(url),
    launcherCwd: runtimePaths.workspaceRoot,
    skillRoots: [runtimePaths.skillsRoot],
    trustConfiguredCommand: packagedCommand !== undefined
  });
  return adapter;
}

export function getAssistantByokAdapter() {
  byokAdapter ??= new OpenAiCompatibleAdapter();
  return byokAdapter;
}

export function disposeAssistantCommandAdapter() {
  adapter?.dispose();
  adapter = null;
  byokAdapter?.dispose();
  byokAdapter = null;
}

export function resetAssistantCommandAdapterForTests() {
  disposeAssistantCommandAdapter();
}

export function resolveAssistantLauncherCwd(userDataPath: string, env: NodeJS.ProcessEnv) {
  return resolveAssistantRuntimePaths(userDataPath, env).workspaceRoot;
}

export function resolveAssistantRuntimePaths(userDataPath: string, env: NodeJS.ProcessEnv) {
  const libraryHome = resolveBootstrapLibraryPaths(env).library_home;
  return resolveFolioleAideRuntimePaths(userDataPath, libraryHome);
}

function resolvePackagedMacosCodexCommand() {
  return app.isPackaged && process.platform === 'darwin'
    ? path.join(process.resourcesPath, '..', 'MacOS', 'codex')
    : undefined;
}

function resolveAssistantEnvironment(
  scriptRoot: string,
  runtimePaths: ReturnType<typeof resolveFolioleAideRuntimePaths>
) {
  const env = resolveAssistantLauncherEnv(process.env, scriptRoot);
  env.CODEX_HOME = runtimePaths.codexHome;
  env.HOME = runtimePaths.deviceDataRoot;
  env.USERPROFILE = runtimePaths.deviceDataRoot;
  return env;
}

function resolveAssistantAgentControlScriptRoot() {
  if (app.isPackaged) return process.resourcesPath;
  return typeof app.getAppPath === 'function' ? app.getAppPath() : process.cwd();
}
