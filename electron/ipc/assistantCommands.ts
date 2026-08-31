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
  persistAssistantImages,
  type StoredAssistantImage
} from '../assistant/assistantImageStorage.js';
import { validateAssistantImageDrafts } from '../assistant/assistantImageValidation.js';
import {
  createAssistantFailure,
  createAssistantStatus
} from '../assistant/codexAppServerAdapterSupport.js';
import {
  disconnectFolioleAideByokSettings,
  loadFolioleAideByokSettings,
  saveFolioleAideByokSettings
} from '../assistant/folioleAideByokSettings.js';
import { runWithAssistantHistoryConnectionOwner } from '../database/assistantHistoryConnection.js';
import {
  getAssistantThreadIndex
} from '../database/assistantThreadIndex.js';

import {
  disposeAssistantCommandAdapter,
  getAssistantAdapter,
  resetAssistantCommandAdapterForTests
} from './assistantAdapterRuntime.js';
import { loadAssistantAgentControlContext, mergeAssistantStatusWithAgentControl } from './assistantAgentControlStatus.js';
import {
  readOpeningLocation,
  readOptionalClientTurnId,
  readOptionalModelSelection,
  readOptionalProviderThreadId
} from './assistantCommandInputs.js';
import { handleAssistantLocalHistoryCommand } from './assistantLocalHistoryCommands.js';
import { sendAssistantTurn } from './assistantSendTurn.js';
import { handleAssistantStorageCommand } from './assistantStorageCommands.js';
import { prepareAssistantThreadContinuation } from './assistantThreadContinuation.js';
import { finishAssistantTurn } from './assistantTurnResult.js';
import { readOptionalWorkspaceContext } from './assistantWorkspaceContextReader.js';
const IPC_ASSISTANT_TURN_EVENT_CHANNEL = 'foliole:assistant-turn-event';
export { disposeAssistantCommandAdapter, resetAssistantCommandAdapterForTests };

export async function handleAssistantCommand(
  command: string,
  args: Record<string, unknown>,
  sender?: WebContents
) {
  if (command === NATIVE_COMMANDS.assistantGetStatus) return getAssistantStatus();
  if (command === NATIVE_COMMANDS.assistantLoadByokSettings) return loadFolioleAideByokSettings();
  if (command === NATIVE_COMMANDS.assistantSaveByokSettings) {
    return saveFolioleAideByokSettings(readByokSettingsInput(args));
  }
  if (command === NATIVE_COMMANDS.assistantDisconnectByokSettings) {
    return disconnectFolioleAideByokSettings();
  }
  if (command === NATIVE_COMMANDS.assistantStartChatGptLogin) return startChatGptLogin();
  if (command === NATIVE_COMMANDS.assistantListModels) return getAssistantAdapter().listModels();
  if (command === NATIVE_COMMANDS.assistantSendMessage) return sendMessage(args, sender);
  return handleAssistantLocalHistoryCommand(command, args) ?? handleAssistantStorageCommand(command);
}

function readByokSettingsInput(args: Record<string, unknown>) {
  if (typeof args.endpoint !== 'string' || typeof args.model !== 'string') {
    throw new Error('invalid_byok_settings');
  }
  if (args.api_key !== undefined && typeof args.api_key !== 'string') {
    throw new Error('invalid_byok_settings');
  }
  return {
    endpoint: args.endpoint,
    model: args.model,
    ...(typeof args.api_key === 'string' ? { api_key: args.api_key } : {})
  };
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
  let modelSelection: import('../../lib/platform/nativeAssistantContract.js').NativeAssistantModelSelection | undefined;
  let providerThreadId: string | undefined;
  let workspaceContext: NativeAssistantWorkspaceContext | undefined;
  let validatedImages: ReturnType<typeof validateAssistantImageDrafts>;
  try {
    clientTurnId = readOptionalClientTurnId(args.clientTurnId) ?? createClientTurnId();
    openingLocation = readOpeningLocation(args.openingLocation);
    modelSelection = readOptionalModelSelection(args.modelSelection);
    providerThreadId = readOptionalProviderThreadId(args.providerThreadId);
    workspaceContext = readOptionalWorkspaceContext(args.workspaceContext);
    validatedImages = validateAssistantImageDrafts(args.images);
  } catch {
    return assistantProtocolFailure();
  }
  if (!await isThreadLocationAllowed(providerThreadId, openingLocation)) return assistantProtocolFailure();
  const agentControl = await loadAssistantAgentControlContext(resolveFolioleAppVersion(app));
  let continuation: Awaited<ReturnType<typeof prepareAssistantThreadContinuation>>;
  try {
    continuation = await runWithAssistantHistoryConnectionOwner(
      () => prepareAssistantThreadContinuation(providerThreadId, agentControl)
    );
  } catch {
    return assistantProtocolFailure();
  }
  const assistantAdapter = readAssistantAdapter();
  if (!assistantAdapter) return createAssistantFailure('failed', 'launch_failed');
  let images: StoredAssistantImage[];
  try {
    images = await persistAssistantImages(validatedImages);
  } catch {
    return assistantProtocolFailure();
  }
  const result = await sendAssistantTurn({
    agentControl,
    adapter: assistantAdapter,
    clientTurnId,
    continuation,
    images,
    message,
    ...(modelSelection ? { modelSelection } : {}),
    ...(sender ? { onEvent: createAssistantTurnEventSender(sender, clientTurnId) } : {}),
    ...(workspaceContext ? { workspaceContext } : {})
  });
  return finishAssistantTurn({
    clientTurnId,
    continuation,
    images,
    message,
    ...(openingLocation ? { openingLocation } : {}),
    result
  });
}

function readAssistantAdapter() {
  try {
    return getAssistantAdapter();
  } catch {
    return null;
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

async function isThreadLocationAllowed(
  providerThreadId: string | undefined,
  openingLocation: NativeAssistantThreadOpeningLocation | undefined
) {
  if (!providerThreadId) return true;
  if (!openingLocation) return false;
  try {
    const existing = await runWithAssistantHistoryConnectionOwner(() => getAssistantThreadIndex(providerThreadId));
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
