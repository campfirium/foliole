import { randomUUID } from 'node:crypto';

import type { NativeAssistantFailureCategory } from '../../lib/platform/nativeAssistantContract.js';
import type {
  NativeAssistantCustomModel,
  NativeAssistantModelDraftInput,
  NativeAssistantModelInput,
  NativeAssistantModelSettings,
  NativeAssistantModelTestResult
} from '../../lib/platform/nativeAssistantModelSettingsContract.js';
import {
  CURRENT_ASSISTANT_MODEL_TOOL_CONTRACT_VERSION,
  NATIVE_ASSISTANT_CODEX_MODEL_ID
} from '../../lib/platform/nativeAssistantModelSettingsContract.js';
import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';
import {
  deletePublishDeviceSecret as deleteDeviceSecret,
  hasPublishDeviceSecret as hasDeviceSecret,
  readPublishDeviceSecret as readDeviceSecret,
  writePublishDeviceSecret as writeDeviceSecret
} from '../security/publishDeviceSecretStore.js';

import { testOpenAiCompatibleModel } from './folioleAideModelConnection.js';
import { createStoredModelDraft, validateDraftId } from './folioleAideModelDraft.js';
import {
  normalizeAssistantModelEndpoint,
  readStoredAssistantModelSettings,
  type StoredAssistantModel as StoredModel,
  type StoredAssistantModelSettings as StoredModelSettings
} from './folioleAideModelSettingsStorage.js';

export const FOLIOLE_AIDE_MODEL_SETTINGS_KEY = 'foliole_aide_byok_settings';
const SECRET_LABEL = 'Foliole Aide model API key';

export interface FolioleAideModelRuntimeConfig {
  apiKey: string;
  endpoint: string;
  model: string;
}

export function loadFolioleAideModelSettings(): NativeAssistantModelSettings {
  return publicSettings(loadStoredSettings());
}

export function saveFolioleAideModelDraft(
  input: NativeAssistantModelDraftInput
): NativeAssistantModelSettings {
  const stored = loadStoredSettings();
  const previous = stored.models.find((model) => model.id === input.id);
  return publicSettings(saveCandidate(
    stored,
    createStoredModelDraft(input, previous),
    input.api_key
  ));
}

export async function testAndSaveFolioleAideModel(
  input: NativeAssistantModelInput
): Promise<NativeAssistantModelTestResult> {
  const stored = loadStoredSettings();
  const previous = input.id ? stored.models.find((model) => model.id === input.id) : undefined;
  const suppliedKey = input.api_key?.trim() ?? '';
  const candidate = normalizeModelInput(input, previous, suppliedKey);
  if (candidate.requires_new_key) {
    return failureResult(saveCandidate(stored, candidate), 'auth_failed');
  }
  const apiKey = suppliedKey || readStoredKey(previous);
  if (!apiKey) {
    return failureResult(saveCandidate(stored, candidate), 'auth_failed');
  }
  const failure = await testOpenAiCompatibleModel({
    apiKey,
    endpoint: candidate.endpoint,
    model: candidate.model
  });
  if (failure) {
    const saved = saveCandidate(stored, candidate, apiKey);
    return failureResult(saved, failure);
  }
  const saved = saveCandidate(stored, {
    ...candidate,
    tool_contract_version: CURRENT_ASSISTANT_MODEL_TOOL_CONTRACT_VERSION,
    verified: true
  }, apiKey);
  return { settings: publicSettings(saved), state: 'ready' };
}

export function selectFolioleAideModel(id: string) {
  const stored = loadStoredSettings();
  if (id !== NATIVE_ASSISTANT_CODEX_MODEL_ID) {
    const model = stored.models.find((entry) => entry.id === id);
    if (!model || publicModel(model).state !== 'configured') throw new Error('model_not_configured');
  }
  return publicSettings(saveStoredSettings({ ...stored, selected_model_id: id }));
}

export function deleteFolioleAideModel(id: string) {
  const stored = loadStoredSettings();
  if (id === stored.selected_model_id) throw new Error('active_model_cannot_be_deleted');
  const target = stored.models.find((model) => model.id === id);
  if (!target) return publicSettings(stored);
  const previousKey = readStoredKey(target);
  deleteDeviceSecret(target.secret_file);
  try {
    return publicSettings(saveStoredSettings({
      ...stored,
      models: stored.models.filter((model) => model.id !== id)
    }));
  } catch (error) {
    if (previousKey) writeDeviceSecret(target.secret_file, SECRET_LABEL, previousKey);
    throw error;
  }
}

export function loadFolioleAideModelRuntimeConfig(): FolioleAideModelRuntimeConfig {
  const stored = loadStoredSettings();
  const selected = stored.models.find((model) => model.id === stored.selected_model_id);
  if (!selected || publicModel(selected).state !== 'configured') throw new Error('byok_not_configured');
  return {
    apiKey: readDeviceSecret(selected.secret_file, SECRET_LABEL),
    endpoint: selected.endpoint,
    model: selected.model
  };
}

function saveCandidate(stored: StoredModelSettings, candidate: StoredModel, apiKey?: string) {
  const previous = stored.models.find((model) => model.id === candidate.id);
  const previousKey = readStoredKey(previous);
  if (apiKey !== undefined) {
    if (apiKey) writeDeviceSecret(candidate.secret_file, SECRET_LABEL, apiKey);
    else deleteDeviceSecret(candidate.secret_file);
  }
  try {
    return saveStoredSettings({
      ...stored,
      models: previous
        ? stored.models.map((model) => model.id === candidate.id ? candidate : model)
        : [...stored.models, candidate],
      selected_model_id: stored.selected_model_id === candidate.id && !candidate.verified
        ? NATIVE_ASSISTANT_CODEX_MODEL_ID
        : stored.selected_model_id
    });
  } catch (error) {
    if (apiKey !== undefined) restoreSecret(candidate.secret_file, previousKey);
    throw error;
  }
}

function normalizeModelInput(
  input: NativeAssistantModelInput,
  previous: StoredModel | undefined,
  suppliedKey: string
): StoredModel {
  const endpoint = normalizeAssistantModelEndpoint(input.endpoint);
  const model = input.model.trim();
  if (!model || model.length > 200) throw new Error('invalid_byok_model');
  const id = previous?.id ?? (input.id ? validateDraftId(input.id) : randomUUID());
  const endpointChanged = Boolean(previous && previous.endpoint !== endpoint);
  return {
    endpoint,
    id,
    model,
    requires_new_key: !suppliedKey && (endpointChanged || previous?.requires_new_key === true),
    secret_file: previous?.secret_file ?? `foliole-aide-model-${id}.bin`,
    updated_at: new Date().toISOString(),
    verified: false
  };
}

export const normalizeEndpoint = normalizeAssistantModelEndpoint;

function loadStoredSettings(): StoredModelSettings {
  const value = loadJsonSetting(FOLIOLE_AIDE_MODEL_SETTINGS_KEY);
  const result = readStoredAssistantModelSettings(value);
  return result.migrated ? saveStoredSettings(result.settings) : result.settings;
}

function saveStoredSettings(settings: StoredModelSettings) {
  const next = { ...settings, updated_at: new Date().toISOString(), version: 2 as const };
  saveJsonSetting(FOLIOLE_AIDE_MODEL_SETTINGS_KEY, next, next.updated_at);
  return next;
}

function publicSettings(stored: StoredModelSettings): NativeAssistantModelSettings {
  return { models: stored.models.map(publicModel), selected_model_id: stored.selected_model_id };
}

function publicModel(stored: StoredModel): NativeAssistantCustomModel {
  const hasApiKey = hasDeviceSecret(stored.secret_file);
  if (!stored.verified
    || stored.tool_contract_version !== CURRENT_ASSISTANT_MODEL_TOOL_CONTRACT_VERSION) {
    return { ...publicFields(stored), has_api_key: hasApiKey, state: 'not_configured' };
  }
  if (!hasApiKey) return { ...publicFields(stored), has_api_key: false, state: 'secure_storage_unavailable' };
  try {
    readDeviceSecret(stored.secret_file, SECRET_LABEL);
    return { ...publicFields(stored), has_api_key: true, state: 'configured' };
  } catch {
    return { ...publicFields(stored), has_api_key: true, state: 'secure_storage_unavailable' };
  }
}

function publicFields(stored: StoredModel) {
  return {
    endpoint: stored.endpoint,
    id: stored.id,
    model: stored.model,
    tool_contract_version: stored.tool_contract_version ?? 0
  };
}

function readStoredKey(stored?: StoredModel) {
  return stored && hasDeviceSecret(stored.secret_file)
    ? readDeviceSecret(stored.secret_file, SECRET_LABEL)
    : '';
}

function restoreSecret(file: string, value: string) {
  if (value) writeDeviceSecret(file, SECRET_LABEL, value);
  else deleteDeviceSecret(file);
}

function failureResult(
  settings: StoredModelSettings,
  category: NativeAssistantFailureCategory
): NativeAssistantModelTestResult {
  return { failure: { category }, settings: publicSettings(settings), state: 'failed' };
}
