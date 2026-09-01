import type { NativeAideStorageInfo } from '../../../lib/platform/nativeAideStorageContract';
import type {
  NativeAssistantByokSettings,
  NativeAssistantByokSettingsInput
} from '../../../lib/platform/nativeAssistantByokContract';
import type {
  NativeAssistantSendMessageArgs,
  NativeAssistantSendMessageResult,
  NativeAssistantLoginResult,
  NativeAssistantModelCatalog,
  NativeAssistantStatusResult,
  NativeAssistantThreadIndexListArgs,
  NativeAssistantThreadIndexMutationArgs,
  NativeAssistantThreadMessageListArgs,
  NativeAssistantThreadMessageRecord,
  NativeAssistantThreadIndexRecord,
  NativeAssistantTurnEvent
} from '../../../lib/platform/nativeAssistantContract';
import type { NativeAssistantProviderId } from '../../../lib/platform/nativeAssistantContract';
import type { NativeAssistantImageContentResult } from '../../../lib/platform/nativeAssistantImageContract';
import type {
  NativeAssistantModelDraftInput,
  NativeAssistantModelInput,
  NativeAssistantModelSettings,
  NativeAssistantModelTestResult
} from '../../../lib/platform/nativeAssistantModelSettingsContract';
import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { getElectronAPI } from './electronApi';
import { getRuntimeInvoke } from './runtimeInvoke';

const ASSISTANT_BYOK_SETTINGS_EVENT = 'foliole-assistant-byok-settings-change';
const ASSISTANT_MODEL_SETTINGS_EVENT = 'foliole-assistant-model-settings-change';
const ASSISTANT_STATUS_REFRESH_EVENT = 'foliole-assistant-status-refresh';

export async function loadAssistantStatus(): Promise<NativeAssistantStatusResult | null> {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  return invoke(NATIVE_COMMANDS.assistantGetStatus);
}

export async function startAssistantChatGptLogin(): Promise<NativeAssistantLoginResult | null> {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  const result = await invoke(NATIVE_COMMANDS.assistantStartChatGptLogin);
  if (result.state === 'ready') window.dispatchEvent(new Event(ASSISTANT_STATUS_REFRESH_EVENT));
  return result;
}

export function subscribeAssistantStatusRefresh(listener: () => void) {
  window.addEventListener(ASSISTANT_STATUS_REFRESH_EVENT, listener);
  return () => window.removeEventListener(ASSISTANT_STATUS_REFRESH_EVENT, listener);
}

export async function loadAssistantModelCatalog(): Promise<NativeAssistantModelCatalog | null> {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  return invoke(NATIVE_COMMANDS.assistantListModels);
}

export async function sendAssistantMessage(
  args: NativeAssistantSendMessageArgs
): Promise<NativeAssistantSendMessageResult | null> {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  return invoke(NATIVE_COMMANDS.assistantSendMessage, args);
}

export function subscribeAssistantTurnEvents(
  handler: (event: NativeAssistantTurnEvent) => void
) {
  return getElectronAPI()?.onAssistantTurnEvent?.(handler) ?? (() => undefined);
}

export async function listAssistantThreadIndex(
  args?: NativeAssistantThreadIndexListArgs
): Promise<NativeAssistantThreadIndexRecord[] | null> {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  return invoke(NATIVE_COMMANDS.assistantListThreadIndex, args);
}

export async function listAssistantThreadMessages(
  args: NativeAssistantThreadMessageListArgs
): Promise<NativeAssistantThreadMessageRecord[] | null> {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  return invoke(NATIVE_COMMANDS.assistantListThreadMessages, args);
}

export async function loadAssistantImageAttachment(
  attachmentId: string
): Promise<NativeAssistantImageContentResult | null> {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  return invoke(NATIVE_COMMANDS.assistantReadImageAttachment, { attachmentId });
}

export async function archiveAssistantThreadIndex(
  args: NativeAssistantThreadIndexMutationArgs
): Promise<NativeAssistantThreadIndexRecord | null> {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  return invoke(NATIVE_COMMANDS.assistantArchiveThreadIndex, args);
}

export async function removeAssistantThreadFromHistory(
  args: NativeAssistantThreadIndexMutationArgs
): Promise<NativeAssistantThreadIndexRecord | null> {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  return invoke(NATIVE_COMMANDS.assistantRemoveThreadFromHistory, args);
}

export async function loadAssistantStorageInfo(): Promise<NativeAideStorageInfo | null> {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  return invoke(NATIVE_COMMANDS.assistantGetStorageInfo);
}

export async function openAssistantStorageLocation(): Promise<boolean> {
  const invoke = getRuntimeInvoke();
  if (!invoke) return false;
  await invoke(NATIVE_COMMANDS.assistantOpenStorageLocation);
  return true;
}

export async function loadAssistantByokSettings(): Promise<NativeAssistantByokSettings | null> {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  return invoke(NATIVE_COMMANDS.assistantLoadByokSettings);
}

export async function loadAssistantModelSettings(): Promise<NativeAssistantModelSettings | null> {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  return invoke(NATIVE_COMMANDS.assistantLoadModelSettings);
}

export async function saveAssistantModelDraft(
  input: NativeAssistantModelDraftInput
): Promise<NativeAssistantModelSettings | null> {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  return publishModelSettings(await invoke(NATIVE_COMMANDS.assistantSaveModelDraft, input));
}

export async function testAssistantModel(
  input: NativeAssistantModelInput
): Promise<NativeAssistantModelTestResult | null> {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  const result = await invoke(NATIVE_COMMANDS.assistantTestModel, input);
  publishModelSettings(result.settings);
  return result;
}

export async function deleteAssistantModel(id: string): Promise<NativeAssistantModelSettings | null> {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  return publishModelSettings(await invoke(NATIVE_COMMANDS.assistantDeleteModel, { id }));
}

export async function selectAssistantModel(id: string): Promise<NativeAssistantModelSettings | null> {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  return publishModelSettings(await invoke(NATIVE_COMMANDS.assistantSelectModel, { id }));
}

export function subscribeAssistantModelSettings(
  listener: (settings: NativeAssistantModelSettings) => void
) {
  const handler = (event: Event) => {
    listener((event as CustomEvent<NativeAssistantModelSettings>).detail);
  };
  window.addEventListener(ASSISTANT_MODEL_SETTINGS_EVENT, handler);
  return () => window.removeEventListener(ASSISTANT_MODEL_SETTINGS_EVENT, handler);
}

export async function saveAssistantByokSettings(
  input: NativeAssistantByokSettingsInput
): Promise<NativeAssistantByokSettings | null> {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  return publishByokSettings(await invoke(NATIVE_COMMANDS.assistantSaveByokSettings, input));
}

export async function disconnectAssistantByokSettings(): Promise<NativeAssistantByokSettings | null> {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  return publishByokSettings(await invoke(NATIVE_COMMANDS.assistantDisconnectByokSettings));
}

export async function selectAssistantProvider(
  provider: NativeAssistantProviderId
): Promise<NativeAssistantByokSettings | null> {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  return publishByokSettings(await invoke(NATIVE_COMMANDS.assistantSetProvider, { provider }));
}

export function subscribeAssistantByokSettings(
  listener: (settings: NativeAssistantByokSettings) => void
) {
  const handler = (event: Event) => {
    listener((event as CustomEvent<NativeAssistantByokSettings>).detail);
  };
  window.addEventListener(ASSISTANT_BYOK_SETTINGS_EVENT, handler);
  return () => window.removeEventListener(ASSISTANT_BYOK_SETTINGS_EVENT, handler);
}

function publishByokSettings(settings: NativeAssistantByokSettings) {
  window.dispatchEvent(new CustomEvent(ASSISTANT_BYOK_SETTINGS_EVENT, { detail: settings }));
  return settings;
}

function publishModelSettings(settings: NativeAssistantModelSettings) {
  window.dispatchEvent(new CustomEvent(ASSISTANT_MODEL_SETTINGS_EVENT, { detail: settings }));
  const selected = settings.models.find((model) => model.id === settings.selected_model_id);
  const visible = selected ?? settings.models[0];
  publishByokSettings(visible ? {
    endpoint: visible.endpoint,
    has_api_key: visible.has_api_key,
    model: visible.model,
    selected_provider: selected ? 'openai-compatible' : 'codex-app-server',
    state: visible.state
  } : {
    endpoint: '', has_api_key: false, model: '',
    selected_provider: 'codex-app-server',
    state: 'not_configured'
  });
  return settings;
}
