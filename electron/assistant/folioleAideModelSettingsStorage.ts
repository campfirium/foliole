import { isIP } from 'node:net';

import { NATIVE_ASSISTANT_CODEX_MODEL_ID } from '../../lib/platform/nativeAssistantModelSettingsContract.js';

const LEGACY_SECRET_FILE = 'foliole-aide-byok-secret.bin';

export interface StoredAssistantModel {
  api_key_length?: number;
  endpoint: string;
  id: string;
  model: string;
  requires_new_key: boolean;
  secret_file: string;
  tool_contract_version?: number;
  updated_at: string;
  verified: boolean;
}

export interface StoredAssistantModelSettings {
  models: StoredAssistantModel[];
  selected_model_id: string;
  updated_at: string;
  version: 2;
}

export function readStoredAssistantModelSettings(value: unknown) {
  const current = parseStoredSettings(value);
  if (current) return { migrated: false, settings: current };
  const migrated = migrateLegacySettings(value);
  if (migrated) return { migrated: true, settings: migrated };
  return { migrated: false, settings: emptyStoredAssistantModelSettings() };
}

export function emptyStoredAssistantModelSettings(): StoredAssistantModelSettings {
  return {
    models: [],
    selected_model_id: NATIVE_ASSISTANT_CODEX_MODEL_ID,
    updated_at: new Date().toISOString(),
    version: 2
  };
}

export function normalizeAssistantModelEndpoint(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 2048) throw new Error('invalid_byok_endpoint');
  let endpoint: URL;
  try {
    endpoint = new URL(normalized);
  } catch {
    throw new Error('invalid_byok_endpoint');
  }
  if (endpoint.username || endpoint.password || endpoint.hash) throw new Error('invalid_byok_endpoint');
  if (endpoint.protocol !== 'https:' && !isLoopbackHttp(endpoint)) throw new Error('invalid_byok_endpoint');
  appendChatCompletionsPathForKnownBase(endpoint);
  return endpoint.toString();
}

export function areAssistantModelEndpointsEquivalent(left: string, right: string) {
  try {
    return normalizeAssistantModelEndpoint(left) === normalizeAssistantModelEndpoint(right);
  } catch {
    return left === right;
  }
}

function appendChatCompletionsPathForKnownBase(endpoint: URL) {
  const path = endpoint.pathname.replace(/\/+$/u, '');
  if (/(?:^|\/)(?:v\d+(?:beta\d*)?|openai)$/iu.test(path)) {
    endpoint.pathname = `${path}/chat/completions`;
  }
}

function isLoopbackHttp(endpoint: URL) {
  if (endpoint.protocol !== 'http:') return false;
  const hostname = endpoint.hostname.replace(/^\[|\]$/gu, '').toLowerCase();
  return hostname === 'localhost' || hostname === '::1'
    || (isIP(hostname) === 4 && hostname.startsWith('127.'));
}

function parseStoredSettings(value: unknown): StoredAssistantModelSettings | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const stored = value as Partial<StoredAssistantModelSettings>;
  if (stored.version !== 2 || !Array.isArray(stored.models)) return null;
  const models = stored.models.filter(isStoredModel);
  const selected = stored.selected_model_id === NATIVE_ASSISTANT_CODEX_MODEL_ID
    || models.some((model) => model.id === stored.selected_model_id)
    ? stored.selected_model_id
    : NATIVE_ASSISTANT_CODEX_MODEL_ID;
  return {
    models,
    selected_model_id: selected ?? NATIVE_ASSISTANT_CODEX_MODEL_ID,
    updated_at: typeof stored.updated_at === 'string' ? stored.updated_at : new Date().toISOString(),
    version: 2
  };
}

function migrateLegacySettings(value: unknown): StoredAssistantModelSettings | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const legacy = value as Record<string, unknown>;
  if (typeof legacy.endpoint !== 'string' || typeof legacy.model !== 'string') return null;
  const imported: StoredAssistantModel = {
    endpoint: legacy.endpoint,
    id: 'imported-model',
    model: legacy.model,
    requires_new_key: false,
    secret_file: LEGACY_SECRET_FILE,
    updated_at: typeof legacy.updated_at === 'string' ? legacy.updated_at : new Date().toISOString(),
    verified: true
  };
  return {
    models: [imported],
    selected_model_id: legacy.selected_provider === 'openai-compatible'
      ? imported.id
      : NATIVE_ASSISTANT_CODEX_MODEL_ID,
    updated_at: new Date().toISOString(),
    version: 2
  };
}

function isStoredModel(value: unknown): value is StoredAssistantModel {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const model = value as Partial<StoredAssistantModel>;
  const hasStringFields = ['endpoint', 'id', 'model', 'secret_file', 'updated_at']
    .every((key) => typeof model[key as keyof StoredAssistantModel] === 'string');
  if (!hasStringFields) return false;
  model.requires_new_key = typeof model.requires_new_key === 'boolean' ? model.requires_new_key : false;
  model.verified = typeof model.verified === 'boolean' ? model.verified : true;
  if (model.tool_contract_version !== undefined
    && (!Number.isInteger(model.tool_contract_version) || model.tool_contract_version < 0)) return false;
  if (model.api_key_length !== undefined
    && (!Number.isInteger(model.api_key_length) || model.api_key_length < 0 || model.api_key_length > 4096)) {
    return false;
  }
  return true;
}
