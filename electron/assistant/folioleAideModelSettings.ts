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

import { testOpenAiCompatibleModel } from './folioleAideModelConnection.js';
import { createStoredModelDraft, validateDraftId } from './folioleAideModelDraft.js';
import {
  deleteFolioleAideModelSecret,
  hasFolioleAideModelSecret,
  readFolioleAideModelSecret,
  writeFolioleAideModelSecret
} from './folioleAideModelSecretSession.js';
import {
  areAssistantModelEndpointsEquivalent,
  normalizeAssistantModelEndpoint,
  readStoredAssistantModelSettings,
  type StoredAssistantModel as StoredModel,
  type StoredAssistantModelSettings as StoredModelSettings
} from './folioleAideModelSettingsStorage.js';

export const FOLIOLE_AIDE_MODEL_SETTINGS_KEY = 'foliole_aide_byok_settings';

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
    input.api_key?.trim()
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
    return failureResult(saveCandidate(stored, candidate), { category: 'auth_failed' });
  }
  const apiKey = suppliedKey || readStoredKey(previous);
  if (!apiKey) {
    return failureResult(saveCandidate(stored, candidate), { category: 'auth_failed' });
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
  deleteFolioleAideModelSecret(target.secret_file);
  try {
    return publicSettings(saveStoredSettings({
      ...stored,
      models: stored.models.filter((model) => model.id !== id)
    }));
  } catch (error) {
    if (previousKey) writeFolioleAideModelSecret(target.secret_file, previousKey);
    throw error;
  }
}

export function loadFolioleAideModelRuntimeConfig(): FolioleAideModelRuntimeConfig {
  const stored = loadStoredSettings();
  const selected = stored.models.find((model) => model.id === stored.selected_model_id);
  if (!selected || publicModel(selected).state !== 'configured') throw new Error('byok_not_configured');
  return {
    apiKey: readFolioleAideModelSecret(selected.secret_file),
    endpoint: selected.endpoint,
    model: selected.model
  };
}

function saveCandidate(stored: StoredModelSettings, candidate: StoredModel, apiKey?: string) {
  const previous = stored.models.find((model) => model.id === candidate.id);
  const previousKey = readStoredKey(previous);
  const nextCandidate = apiKey === undefined
    ? candidate
    : { ...candidate, api_key_length: apiKey.length };
  if (apiKey !== undefined) {
    if (apiKey) writeFolioleAideModelSecret(candidate.secret_file, apiKey);
    else deleteFolioleAideModelSecret(candidate.secret_file);
  }
  try {
    return saveStoredSettings({
      ...stored,
      models: previous
        ? stored.models.map((model) => model.id === nextCandidate.id ? nextCandidate : model)
        : [...stored.models, nextCandidate],
      selected_model_id: stored.selected_model_id === nextCandidate.id && !nextCandidate.verified
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
  const endpointChanged = Boolean(previous
    && !areAssistantModelEndpointsEquivalent(previous.endpoint, endpoint));
  return {
    ...(suppliedKey
      ? { api_key_length: suppliedKey.length }
      : previous?.api_key_length !== undefined ? { api_key_length: previous.api_key_length } : {}),
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
  const hasApiKey = hasFolioleAideModelSecret(stored.secret_file);
  if (!stored.verified
    || stored.tool_contract_version !== CURRENT_ASSISTANT_MODEL_TOOL_CONTRACT_VERSION) {
    return { ...publicFields(stored), has_api_key: hasApiKey, state: 'not_configured' };
  }
  if (!hasApiKey) return { ...publicFields(stored), has_api_key: false, state: 'secure_storage_unavailable' };
  try {
    readFolioleAideModelSecret(stored.secret_file);
    return { ...publicFields(stored), has_api_key: true, state: 'configured' };
  } catch {
    return { ...publicFields(stored), has_api_key: true, state: 'secure_storage_unavailable' };
  }
}

function publicFields(stored: StoredModel) {
  return {
    api_key_length: stored.api_key_length ?? 0,
    endpoint: stored.endpoint,
    id: stored.id,
    model: stored.model,
    tool_contract_version: stored.tool_contract_version ?? 0
  };
}

function readStoredKey(stored?: StoredModel) {
  return stored && hasFolioleAideModelSecret(stored.secret_file)
    ? readFolioleAideModelSecret(stored.secret_file)
    : '';
}

function restoreSecret(file: string, value: string) {
  if (value) writeFolioleAideModelSecret(file, value);
  else deleteFolioleAideModelSecret(file);
}

function failureResult(
  settings: StoredModelSettings,
  failure: { category: NativeAssistantFailureCategory; message?: string }
): NativeAssistantModelTestResult {
  return { failure, settings: publicSettings(settings), state: 'failed' };
}
