import { app, type WebContents } from 'electron';

import { createDefaultAideToolPermissionSettings } from '../../lib/core/assistant/aideToolPermissionSettings.js';
import type {
  NativeAssistantThreadOpeningLocation,
  NativeAssistantStatusResult,
  NativeAssistantTurnEvent,
  NativeAssistantWorkspaceContext
} from '../../lib/platform/nativeAssistantContract.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { resolveFolioleAppVersion } from '../appVersion.js';
import { prepareAideAttachedContextForTurn } from '../assistant/aideAttachedContextTurn.js';
import { readAideCurrentMaterialIds } from '../assistant/aideReadScope.js';
import { createAideToolSession } from '../assistant/aideToolSession.js';
import { cancelAideWriteApprovals, requestAideWriteApproval, resolveAideWriteApproval } from '../assistant/aideWriteApprovals.js';
import { describeAideWriteRequests } from '../assistant/aideWriteChangeDescriptions.js';
import { persistAssistantImages } from '../assistant/assistantImageStorage.js';
import {
  createAssistantFailure,
  createAssistantStatus
} from '../assistant/codexAppServerAdapterSupport.js';
import {
  disconnectFolioleAideByokSettings,
  loadFolioleAideByokSettings,
  saveFolioleAideByokSettings,
  setFolioleAideProvider
} from '../assistant/folioleAideByokSettings.js';
import { loadFolioleAideCustomInstructions } from '../assistant/folioleAideCustomInstructions.js';
import { loadFolioleAideToolPermissionSettings } from '../assistant/folioleAideToolPermissionSettings.js';
import { runWithAssistantHistoryConnectionOwner } from '../database/assistantHistoryConnection.js';
import {
  getAssistantThreadIndex
} from '../database/assistantThreadIndex.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';

import {
  disposeAssistantCommandAdapter,
  getAssistantAdapter,
  getAssistantByokAdapter,
  resetAssistantCommandAdapterForTests
} from './assistantAdapterRuntime.js';
import { loadAssistantAgentControlContext, mergeAssistantStatusWithAgentControl } from './assistantAgentControlStatus.js';
import { readAssistantProvider } from './assistantCommandInputs.js';
import { handleAssistantLocalHistoryCommand } from './assistantLocalHistoryCommands.js';
import { handleAssistantModelCommand } from './assistantModelCommands.js';
import { readAssistantSendCommandInput } from './assistantSendCommandInput.js';
import { sendAssistantTurn } from './assistantSendTurn.js';
import { handleAssistantStorageCommand } from './assistantStorageCommands.js';
import { prepareAssistantThreadContinuation } from './assistantThreadContinuation.js';
import { finishAssistantTurn } from './assistantTurnResult.js';
const IPC_ASSISTANT_TURN_EVENT_CHANNEL = 'foliole:assistant-turn-event';
export { disposeAssistantCommandAdapter, resetAssistantCommandAdapterForTests };

export async function handleAssistantCommand(
  command: string,
  args: Record<string, unknown>,
  sender?: WebContents
) {
  if (command === NATIVE_COMMANDS.assistantGetStatus) return getAssistantStatus();
  const modelCommand = handleAssistantModelCommand(command, args);
  if (modelCommand) return modelCommand;
  if (command === NATIVE_COMMANDS.assistantLoadByokSettings) {
    return runWithDatabaseConnectionOwner(loadFolioleAideByokSettings);
  }
  if (command === NATIVE_COMMANDS.assistantSaveByokSettings) {
    return saveFolioleAideByokSettings(readByokSettingsInput(args));
  }
  if (command === NATIVE_COMMANDS.assistantDisconnectByokSettings) {
    return runWithDatabaseConnectionOwner(disconnectFolioleAideByokSettings);
  }
  if (command === NATIVE_COMMANDS.assistantSetProvider) {
    return runWithDatabaseConnectionOwner(
      () => setFolioleAideProvider(readAssistantProvider(args.provider))
    );
  }
  if (command === NATIVE_COMMANDS.assistantStartChatGptLogin) return startChatGptLogin();
  if (command === NATIVE_COMMANDS.assistantListModels) return getAssistantAdapter().listModels();
  if (command === NATIVE_COMMANDS.assistantSendMessage) return sendMessage(args, sender);
  if (command === NATIVE_COMMANDS.assistantResolveWriteApproval) {
    if (typeof args.approvalId !== 'string' || typeof args.approved !== 'boolean') throw new Error('invalid_write_approval');
    return { resolved: resolveAideWriteApproval(args.approvalId, args.approved) };
  }
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
  let input: ReturnType<typeof readAssistantSendCommandInput>;
  try {
    input = readAssistantSendCommandInput(args);
  } catch {
    return assistantProtocolFailure();
  }
  const {
    clientTurnId, message, modelSelection, openingLocation, provider,
    providerThreadId, validatedImages, workspaceContext
  } = input;
  if (!await isThreadLocationAllowed(provider, providerThreadId, openingLocation)) {
    return assistantProtocolFailure(provider);
  }
  const agentControl = await loadAssistantAgentControlContext(resolveFolioleAppVersion(app));
  let continuation: Awaited<ReturnType<typeof prepareAssistantThreadContinuation>>;
  try {
    continuation = await runWithAssistantHistoryConnectionOwner(
      () => prepareAssistantThreadContinuation(provider, providerThreadId, agentControl)
    );
  } catch {
    return assistantProtocolFailure(provider);
  }
  if (provider === 'openai-compatible' && modelSelection) return assistantProtocolFailure(provider);
  const assistantAdapter = provider === 'codex-app-server' ? readAssistantAdapter() : null;
  if (provider === 'codex-app-server' && !assistantAdapter) {
    return createAssistantFailure('failed', 'launch_failed');
  }
  const images = await persistAssistantImages(validatedImages).catch(() => null);
  if (!images) return assistantProtocolFailure();
  const customInstructions = await readCustomInstructionsForTurn();
  const attachedContext = await prepareAideAttachedContextForTurn({ provider, providerThreadId, workspaceContext });
  const result = await sendAssistantTurn({
    agentControl,
    ...(attachedContext ? { attachedContext: attachedContext.text } : {}),
    customInstructions,
    adapter: assistantAdapter,
    byokAdapter: getAssistantByokAdapter(),
    clientTurnId,
    continuation,
    images,
    message,
    provider,
    ...(sender ? { sender } : {}),
    toolSession: await createTurnToolSession(clientTurnId, provider, sender, readAideCurrentMaterialIds(workspaceContext)),
    ...(modelSelection ? { modelSelection } : {}),
    ...(sender ? { onEvent: createAssistantTurnEventSender(sender, clientTurnId) } : {}),
    ...(workspaceContext ? { workspaceContext: omitSelection(workspaceContext) } : {})
  });
  return finishAssistantTurn({
    ...(attachedContext ? { attachedContext } : {}),
    clientTurnId,
    continuation,
    images,
    message,
    ...(openingLocation ? { openingLocation } : {}),
    linkedMaterialIds: input.linkedMaterialIds,
    result
  });
}

async function readCustomInstructionsForTurn() {
  try {
    return (await runWithDatabaseConnectionOwner(loadFolioleAideCustomInstructions)).text;
  } catch {
    return '';
  }
}

async function readToolPermissionsForTurn() {
  try {
    return await runWithDatabaseConnectionOwner(loadFolioleAideToolPermissionSettings);
  } catch {
    return createDefaultAideToolPermissionSettings();
  }
}

// Changes are put to the person in the conversation that asked for them; without a window nobody can allow them.
async function createTurnToolSession(
  clientTurnId: string,
  provider: import('../../lib/platform/nativeAssistantContract.js').NativeAssistantProviderId,
  sender?: WebContents,
  linkedMaterialIds: readonly string[] = []
) {
  const settings = await readToolPermissionsForTurn();
  if (!sender) return createAideToolSession(settings, undefined, linkedMaterialIds);
  const send = createAssistantTurnEventSender(sender, clientTurnId);
  return createAideToolSession(settings, async (requests, signal) => {
    if (sender.isDestroyed()) return false;
    const cancel = () => cancelAideWriteApprovals(clientTurnId);
    sender.once('destroyed', cancel);
    try {
      return await requestAideWriteApproval({
        changes: await describeAideWriteRequests(requests),
        clientTurnId,
        emit: (approval) => send({ approval, clientTurnId, kind: 'approval_requested', provider }),
        ...(signal ? { signal } : {})
      });
    } finally {
      sender.removeListener('destroyed', cancel);
    }
  }, linkedMaterialIds);
}

function readAssistantAdapter() {
  try {
    return getAssistantAdapter();
  } catch {
    return null;
  }
}

function assistantProtocolFailure(
  provider: import('../../lib/platform/nativeAssistantContract.js').NativeAssistantProviderId = 'codex-app-server'
) {
  return {
    failure: { category: 'protocol_error' as const },
    provider,
    state: 'failed' as const
  };
}

function createAssistantTurnEventSender(sender: WebContents, clientTurnId: string) {
  return (event: NativeAssistantTurnEvent) => {
    if (event.clientTurnId !== clientTurnId || sender.isDestroyed()) return;
    sender.send(IPC_ASSISTANT_TURN_EVENT_CHANNEL, event);
  };
}

async function isThreadLocationAllowed(
  provider: import('../../lib/platform/nativeAssistantContract.js').NativeAssistantProviderId,
  providerThreadId: string | undefined,
  openingLocation: NativeAssistantThreadOpeningLocation | undefined
) {
  if (!providerThreadId) return true;
  if (!openingLocation) return false;
  try {
    const existing = await runWithAssistantHistoryConnectionOwner(
      () => getAssistantThreadIndex(provider, providerThreadId)
    );
    return existing.provider === provider && areOpeningLocationsEqual(existing.location, openingLocation);
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

// The selection reaches the model only through the attached context, once per material.
function omitSelection(context: NativeAssistantWorkspaceContext): NativeAssistantWorkspaceContext {
  const rest = { ...context };
  delete rest.selection;
  return rest;
}
