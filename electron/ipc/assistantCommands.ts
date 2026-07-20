import { app, type WebContents } from 'electron';

import type {
  NativeAssistantThreadOpeningLocation,
  NativeAssistantStatusResult,
  NativeAssistantTurnEvent,
  NativeAssistantWorkspaceContext
} from '../../lib/platform/nativeAssistantContract.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { resolveFolioleAppVersion } from '../appVersion.js';
import {
  createAssistantFailure,
  createAssistantStatus
} from '../assistant/codexAppServerAdapterSupport.js';
import {
  getAssistantThreadIndex
} from '../database/assistantThreadIndex.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';

import {
  disposeAssistantCommandAdapter,
  getAssistantAdapter,
  resetAssistantCommandAdapterForTests
} from './assistantAdapterRuntime.js';
import { loadAssistantAgentControlContext, mergeAssistantStatusWithAgentControl } from './assistantAgentControlStatus.js';
import {
  readOpeningLocation,
  readOptionalClientTurnId,
  readOptionalProviderThreadId
} from './assistantCommandInputs.js';
import { handleAssistantLocalHistoryCommand } from './assistantLocalHistoryCommands.js';
import { sendAssistantTurn } from './assistantSendTurn.js';
import { prepareAssistantThreadContinuation } from './assistantThreadContinuation.js';
import { recordAssistantThreadSuccess } from './assistantThreadPersistence.js';
import { readOptionalWorkspaceContext } from './assistantWorkspaceContextReader.js';

const IPC_ASSISTANT_TURN_EVENT_CHANNEL = 'foliole:assistant-turn-event';
export { disposeAssistantCommandAdapter, resetAssistantCommandAdapterForTests };

export async function handleAssistantCommand(
  command: string,
  args: Record<string, unknown>,
  sender?: WebContents
) {
  if (command === NATIVE_COMMANDS.assistantGetStatus) return getAssistantStatus();
  if (command === NATIVE_COMMANDS.assistantStartChatGptLogin) return startChatGptLogin();
  if (command === NATIVE_COMMANDS.assistantSendMessage) return sendMessage(args, sender);
  return handleAssistantLocalHistoryCommand(command, args);
}

async function getAssistantStatus() {
  let status: NativeAssistantStatusResult;
  try {
    status = await getAssistantAdapter().getStatus();
  } catch {
    status = createAssistantStatus('unavailable', 'launch_failed');
  }
  const agentControl = await loadAssistantAgentControlContext(resolveFolioleAppVersion(app));
  return mergeAssistantStatusWithAgentControl(status, agentControl);
}

async function startChatGptLogin() {
  try {
    return await getAssistantAdapter().startChatGptLogin();
  } catch {
    return createAssistantFailure('failed', 'launch_failed');
  }
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
  if (!await isThreadLocationAllowed(providerThreadId, openingLocation)) {
    return assistantProtocolFailure();
  }
  const agentControl = await loadAssistantAgentControlContext(resolveFolioleAppVersion(app));
  let continuation: ReturnType<typeof prepareAssistantThreadContinuation>;
  try {
    continuation = await runWithDatabaseConnectionOwner(
      () => prepareAssistantThreadContinuation(providerThreadId, agentControl)
    );
  } catch {
    return assistantProtocolFailure();
  }
  const result = await sendAssistantTurn({
    agentControl,
    adapter: getAssistantAdapter(),
    clientTurnId,
    continuation,
    message,
    ...(sender ? { onEvent: createAssistantTurnEventSender(sender, clientTurnId) } : {}),
    ...(workspaceContext ? { workspaceContext } : {})
  });
  if (!result) return assistantProtocolFailure();
  const readyMessage = result.message;
  if (result.state !== 'ready' || !openingLocation || !readyMessage?.threadId) return result;
  if (typeof readyMessage.text === 'string' && !readyMessage.text.trim()) return assistantProtocolFailure();
  try {
    const threadIndex = await runWithDatabaseConnectionOwner(() => recordAssistantThreadSuccess({
      agentToolVersion: continuation.agentToolVersion,
      clientTurnId,
      ...createContinuationPersistenceInput(continuation),
      location: openingLocation,
      message,
      result: readyMessage
    }));
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

function createContinuationPersistenceInput(
  continuation: ReturnType<typeof prepareAssistantThreadContinuation>
) {
  return {
    ...(continuation.continuationMessages
      ? { continuationMessages: continuation.continuationMessages }
      : {}),
    ...(continuation.continuedFromThreadId
      ? { continuedFromThreadId: continuation.continuedFromThreadId }
      : {})
  };
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

async function isThreadLocationAllowed(
  providerThreadId: string | undefined,
  openingLocation: NativeAssistantThreadOpeningLocation | undefined
) {
  if (!providerThreadId) return true;
  if (!openingLocation) return false;
  try {
    const existing = await runWithDatabaseConnectionOwner(() => getAssistantThreadIndex(providerThreadId));
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
