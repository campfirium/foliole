import path from 'node:path';

import { app, shell, type WebContents } from 'electron';

import type {
  NativeAssistantThreadOpeningLocation,
  NativeAssistantTurnEvent,
  NativeAssistantWorkspaceContext
} from '../../lib/platform/nativeAssistantContract.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { resolveFolioleAppVersion } from '../appVersion.js';
import { CodexAppServerAdapter } from '../assistant/codexAppServerAdapter.js';
import {
  archiveAssistantThreadIndex,
  deleteAssistantThreadIndex,
  getAssistantThreadIndex,
  listAssistantThreadIndex
} from '../database/assistantThreadIndex.js';
import {
  listAssistantThreadMessages
} from '../database/assistantThreadMessages.js';

import { loadAssistantAgentControlContext, mergeAssistantStatusWithAgentControl } from './assistantAgentControlStatus.js';
import {
  readOpeningLocation,
  readOptionalClientTurnId,
  readOptionalProviderThreadId,
  readProviderThreadId
} from './assistantCommandInputs.js';
import { resolveAssistantLauncherEnv } from './assistantLauncherEnvironment.js';
import { sendAssistantTurn } from './assistantSendTurn.js';
import { prepareAssistantThreadContinuation } from './assistantThreadContinuation.js';
import { recordAssistantThreadSuccess } from './assistantThreadPersistence.js';
import { readOptionalWorkspaceContext } from './assistantWorkspaceContextReader.js';

let adapter: CodexAppServerAdapter | null = null;
const IPC_ASSISTANT_TURN_EVENT_CHANNEL = 'foliole:assistant-turn-event';
const ASSISTANT_WIDGETS_DIRNAME = 'Widgets';
const ASSISTANT_WORKDIR_DIRNAME = 'Foliole Aide';
const LEGACY_ASSISTANT_DELETE_THREAD_INDEX_COMMAND = 'assistant_delete_thread_index';

function getAdapter() {
  const scriptRoot = resolveAssistantAgentControlScriptRoot();
  const packagedCommand = resolvePackagedMacosCodexCommand();
  adapter ??= new CodexAppServerAdapter({
    appVersion: resolveFolioleAppVersion(app),
    ...(packagedCommand ? { command: packagedCommand } : {}),
    env: resolveAssistantEnvironment(scriptRoot),
    openExternal: (url) => shell.openExternal(url),
    launcherCwd: resolveAssistantLauncherCwd(app.getPath('userData'), process.env),
    trustConfiguredCommand: packagedCommand !== undefined
  });
  return adapter;
}

function resolvePackagedMacosCodexCommand() {
  return app.isPackaged && process.platform === 'darwin'
    ? path.join(process.resourcesPath, '..', 'MacOS', 'codex')
    : undefined;
}

function resolveAssistantEnvironment(scriptRoot: string) {
  const env = resolveAssistantLauncherEnv(process.env, scriptRoot);
  if (app.isPackaged && process.platform === 'darwin') {
    env.CODEX_HOME = path.join(app.getPath('userData'), 'Codex');
  }
  return env;
}

function resolveAssistantAgentControlScriptRoot() {
  if (app.isPackaged) return process.resourcesPath;
  return typeof app.getAppPath === 'function' ? app.getAppPath() : process.cwd();
}

export function resolveAssistantLauncherCwd(userDataPath: string, env: NodeJS.ProcessEnv) {
  const libraryHome = env.FOLIOLE_LIBRARY_HOME?.trim();
  return path.join(libraryHome || userDataPath, ASSISTANT_WIDGETS_DIRNAME, ASSISTANT_WORKDIR_DIRNAME);
}

export async function handleAssistantCommand(
  command: string,
  args: Record<string, unknown>,
  sender?: WebContents
) {
  if (command === NATIVE_COMMANDS.assistantGetStatus) return getAssistantStatus();
  if (command === NATIVE_COMMANDS.assistantStartChatGptLogin) return getAdapter().startChatGptLogin();
  if (command === NATIVE_COMMANDS.assistantSendMessage) return sendMessage(args, sender);
  if (command === NATIVE_COMMANDS.assistantListThreadIndex) {
    const location = readOpeningLocation(args.location);
    return listAssistantThreadIndex({
      ...(args.includeArchived === true ? { includeArchived: true } : {}),
      ...(args.includeDeleted === true ? { includeDeleted: true } : {}),
      ...(typeof args.limit === 'number' ? { limit: args.limit } : {}),
      ...(location ? { location } : {})
    });
  }
  if (command === NATIVE_COMMANDS.assistantListThreadMessages) {
    return listAssistantThreadMessages(readProviderThreadId(args));
  }
  if (command === NATIVE_COMMANDS.assistantArchiveThreadIndex) {
    return archiveAssistantThreadIndex(readProviderThreadId(args));
  }
  if (command === NATIVE_COMMANDS.assistantRemoveThreadFromHistory) {
    return deleteAssistantThreadIndex(readProviderThreadId(args));
  }
  if (command === LEGACY_ASSISTANT_DELETE_THREAD_INDEX_COMMAND) {
    return deleteAssistantThreadIndex(readProviderThreadId(args));
  }
  return undefined;
}

async function getAssistantStatus() {
  const status = await getAdapter().getStatus();
  const agentControl = await loadAssistantAgentControlContext(resolveFolioleAppVersion(app));
  return mergeAssistantStatusWithAgentControl(status, agentControl);
}

export function resetAssistantCommandAdapterForTests() {
  disposeAssistantCommandAdapter();
}

export function disposeAssistantCommandAdapter() {
  adapter?.dispose();
  adapter = null;
}

async function sendMessage(args: Record<string, unknown>, sender?: WebContents) {
  const message = typeof args.message === 'string' ? args.message : '';
  let clientTurnId: string;
  let openingLocation: NativeAssistantThreadOpeningLocation | undefined;
  let providerThreadId: string | undefined;
  let workspaceContext: NativeAssistantWorkspaceContext | undefined;
  try {
    clientTurnId = readOptionalClientTurnId(args.clientTurnId) ?? createClientTurnId();
    openingLocation = readOpeningLocation(args.openingLocation);
    providerThreadId = readOptionalProviderThreadId(args.providerThreadId);
    workspaceContext = readOptionalWorkspaceContext(args.workspaceContext);
  } catch {
    return assistantProtocolFailure();
  }
  if (!isThreadLocationAllowed(providerThreadId, openingLocation)) {
    return assistantProtocolFailure();
  }
  const agentControl = await loadAssistantAgentControlContext(resolveFolioleAppVersion(app));
  let continuation: ReturnType<typeof prepareAssistantThreadContinuation>;
  try {
    continuation = prepareAssistantThreadContinuation(providerThreadId, agentControl);
  } catch {
    return assistantProtocolFailure();
  }
  const result = await sendAssistantTurn({
    agentControl,
    adapter: getAdapter(),
    clientTurnId,
    continuation,
    message,
    ...(sender ? { onEvent: createAssistantTurnEventSender(sender, clientTurnId) } : {}),
    ...(workspaceContext ? { workspaceContext } : {})
  });
  if (!result) return assistantProtocolFailure();
  if (result.state !== 'ready' || !openingLocation || !result.message?.threadId) return result;
  if (typeof result.message.text === 'string' && !result.message.text.trim()) return assistantProtocolFailure();
  try {
    const threadIndex = recordAssistantThreadSuccess({
      agentToolVersion: continuation.agentToolVersion,
      clientTurnId,
      ...(continuation.continuedFromThreadId
        ? { continuedFromThreadId: continuation.continuedFromThreadId }
        : {}),
      location: openingLocation,
      message,
      result: result.message
    });
    return {
      ...result,
      threadIndex
    };
  } catch {
    return {
      failure: { category: 'persistence_failed' as const },
      provider: result.provider,
      state: 'failed' as const
    };
  }
}

function assistantProtocolFailure() {
  return {
    failure: { category: 'protocol_error' as const },
    provider: 'codex-app-server' as const,
    state: 'failed' as const
  };
}

function createAssistantTurnEventSender(sender: WebContents, clientTurnId: string) {
  return (event: NativeAssistantTurnEvent) => {
    if (event.clientTurnId !== clientTurnId || sender.isDestroyed()) return;
    sender.send(IPC_ASSISTANT_TURN_EVENT_CHANNEL, event);
  };
}

function createClientTurnId() {
  return `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isThreadLocationAllowed(
  providerThreadId: string | undefined,
  openingLocation: NativeAssistantThreadOpeningLocation | undefined
) {
  if (!providerThreadId) return true;
  if (!openingLocation) return false;
  try {
    const existing = getAssistantThreadIndex(providerThreadId);
    return areOpeningLocationsEqual(existing.location, openingLocation);
  } catch {
    return false;
  }
}

function areOpeningLocationsEqual(
  left: NativeAssistantThreadOpeningLocation,
  right: NativeAssistantThreadOpeningLocation
) {
  if (left.type !== right.type) return false;
  return left.type === 'workspace' || left.nodeId === (right as { nodeId: string }).nodeId;
}
