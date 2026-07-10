import path from 'node:path';

import { app, type WebContents } from 'electron';

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

import {
  resolveAssistantAgentDescriptorPath,
  resolveAssistantAgentControlTracePath,
  resolveAssistantAppServerArgs
} from './assistantAgentControlContext.js';
import { loadAssistantAgentControlContext, mergeAssistantStatusWithAgentControl } from './assistantAgentControlStatus.js';
import {
  readOpeningLocation,
  readOptionalClientTurnId,
  readOptionalProviderThreadId,
  readProviderThreadId
} from './assistantCommandInputs.js';
import { recordAssistantThreadSuccess } from './assistantThreadPersistence.js';
import { readOptionalWorkspaceContext } from './assistantWorkspaceContextReader.js';

let adapter: CodexAppServerAdapter | null = null;
const IPC_ASSISTANT_TURN_EVENT_CHANNEL = 'foliole:assistant-turn-event';
const ASSISTANT_WIDGETS_DIRNAME = 'Widgets';
const ASSISTANT_WORKDIR_DIRNAME = 'Foliole Aide';
const LEGACY_ASSISTANT_DELETE_THREAD_INDEX_COMMAND = 'assistant_delete_thread_index';

function getAdapter() {
  adapter ??= new CodexAppServerAdapter({
    appServerArgs: resolveAssistantAppServerArgs(process.env, resolveAssistantAgentControlScriptRoot()),
    appVersion: resolveFolioleAppVersion(app),
    env: resolveAssistantLauncherEnv(process.env),
    launcherCwd: resolveAssistantLauncherCwd(app.getPath('userData'), process.env)
  });
  return adapter;
}

function resolveAssistantAgentControlScriptRoot() {
  if (app.isPackaged) return process.resourcesPath;
  return typeof app.getAppPath === 'function' ? app.getAppPath() : process.cwd();
}

export function resolveAssistantLauncherCwd(userDataPath: string, env: NodeJS.ProcessEnv) {
  const libraryHome = env.FOLIOLE_LIBRARY_HOME?.trim();
  return path.join(libraryHome || userDataPath, ASSISTANT_WIDGETS_DIRNAME, ASSISTANT_WORKDIR_DIRNAME);
}

export function resolveAssistantLauncherEnv(env: NodeJS.ProcessEnv) {
  const userProfile = env.USERPROFILE?.trim();
  const next: NodeJS.ProcessEnv = {
    ...env,
    FOLIOLE_AGENT_DESCRIPTOR: resolveAssistantAgentDescriptorPath(env),
    FOLIOLE_AGENT_MCP_TRACE_PATH: resolveAssistantAgentControlTracePath(env)
  };
  if (next.CODEX_HOME?.trim()) return next;
  if (!userProfile) return next;
  return {
    ...next,
    CODEX_HOME: path.join(userProfile, '.codex')
  };
}

export async function handleAssistantCommand(
  command: string,
  args: Record<string, unknown>,
  sender?: WebContents
) {
  if (command === NATIVE_COMMANDS.assistantGetStatus) return getAssistantStatus();
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
  const agentControl = await loadAssistantAgentControlContext(
    process.env,
    resolveFolioleAppVersion(app),
    resolveAssistantAgentControlScriptRoot()
  );
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
  const scriptRoot = resolveAssistantAgentControlScriptRoot();
  const agentControl = await loadAssistantAgentControlContext(
    process.env,
    resolveFolioleAppVersion(app),
    scriptRoot
  );
  let result: Awaited<ReturnType<CodexAppServerAdapter['sendMessage']>>;
  try {
    result = await getAdapter().sendMessage({
      clientTurnId,
      message,
      ...(sender ? { onEvent: createAssistantTurnEventSender(sender, clientTurnId) } : {}),
      ...(providerThreadId ? { providerThreadId } : {}),
      ...(workspaceContext ? { workspaceContext: { ...workspaceContext, agentControl } } : {})
    });
  } catch {
    return assistantProtocolFailure();
  }
  if (result.state !== 'ready' || !openingLocation || !result.message?.threadId) return result;
  if (typeof result.message.text === 'string' && !result.message.text.trim()) return assistantProtocolFailure();
  try {
    const threadIndex = recordAssistantThreadSuccess({
      clientTurnId,
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
