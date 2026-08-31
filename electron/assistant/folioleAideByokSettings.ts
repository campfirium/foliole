import { isIP } from 'node:net';

import type {
  NativeAssistantByokSettings,
  NativeAssistantByokSettingsInput
} from '../../lib/platform/nativeAssistantByokContract.js';
import type { NativeAssistantProviderId } from '../../lib/platform/nativeAssistantContract.js';
import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';
import {
  deletePublishDeviceSecret as deleteDeviceSecret,
  hasPublishDeviceSecret as hasDeviceSecret,
  readPublishDeviceSecret as readDeviceSecret,
  writePublishDeviceSecret as writeDeviceSecret
} from '../security/publishDeviceSecretStore.js';

export const FOLIOLE_AIDE_BYOK_SETTINGS_KEY = 'foliole_aide_byok_settings';
const SECRET_FILE = 'foliole-aide-byok-secret.bin';
const SECRET_LABEL = 'Foliole Aide model API key';

interface StoredByokSettings {
  endpoint: string;
  model: string;
  selected_provider: NativeAssistantProviderId;
  updated_at: string;
}

export interface FolioleAideByokRuntimeConfig {
  apiKey: string;
  endpoint: string;
  model: string;
}

export function loadFolioleAideByokSettings(): NativeAssistantByokSettings {
  const stored = loadStoredSettings();
  if (!stored) return emptySettings();
  const hasApiKey = hasDeviceSecret(SECRET_FILE);
  if (!hasApiKey) return publicSettings(stored, false, 'not_configured');
  try {
    readDeviceSecret(SECRET_FILE, SECRET_LABEL);
    return publicSettings(stored, true, 'configured');
  } catch {
    return publicSettings(stored, true, 'secure_storage_unavailable');
  }
}

export function saveFolioleAideByokSettings(
  input: NativeAssistantByokSettingsInput
): NativeAssistantByokSettings {
  const next = normalizeInput(input);
  const previous = loadStoredSettings();
  const previousKey = readPreviousKey(previous);
  const suppliedKey = input.api_key?.trim() ?? '';
  if (previous?.endpoint !== next.endpoint && !suppliedKey) {
    throw new Error('byok_api_key_required_for_endpoint');
  }
  const nextKey = suppliedKey || previousKey;
  if (!nextKey) throw new Error('byok_api_key_required');
  writeDeviceSecret(SECRET_FILE, SECRET_LABEL, nextKey);
  try {
    saveJsonSetting(FOLIOLE_AIDE_BYOK_SETTINGS_KEY, next, next.updated_at);
  } catch (error) {
    restorePreviousKey(previousKey);
    throw error;
  }
  return loadFolioleAideByokSettings();
}

export function disconnectFolioleAideByokSettings(): NativeAssistantByokSettings {
  const previous = loadStoredSettings();
  const previousKey = readPreviousKey(previous);
  deleteDeviceSecret(SECRET_FILE);
  try {
    saveJsonSetting(FOLIOLE_AIDE_BYOK_SETTINGS_KEY, null);
  } catch (error) {
    restorePreviousKey(previousKey);
    throw error;
  }
  return emptySettings();
}

export function setFolioleAideProvider(provider: NativeAssistantProviderId) {
  if (provider !== 'codex-app-server' && provider !== 'openai-compatible') {
    throw new Error('invalid_assistant_provider');
  }
  const stored = loadStoredSettings();
  if (provider === 'openai-compatible' && loadFolioleAideByokSettings().state !== 'configured') {
    throw new Error('byok_not_configured');
  }
  if (!stored) return emptySettings();
  saveJsonSetting(FOLIOLE_AIDE_BYOK_SETTINGS_KEY, {
    ...stored,
    selected_provider: provider,
    updated_at: new Date().toISOString()
  });
  return loadFolioleAideByokSettings();
}

export function loadFolioleAideByokRuntimeConfig(): FolioleAideByokRuntimeConfig {
  const stored = loadStoredSettings();
  if (!stored || loadFolioleAideByokSettings().state !== 'configured') {
    throw new Error('byok_not_configured');
  }
  return {
    apiKey: readDeviceSecret(SECRET_FILE, SECRET_LABEL),
    endpoint: stored.endpoint,
    model: stored.model
  };
}

function normalizeInput(input: NativeAssistantByokSettingsInput): StoredByokSettings {
  const endpoint = normalizeEndpoint(input.endpoint);
  const model = input.model.trim();
  if (!model || model.length > 200) throw new Error('invalid_byok_model');
  return {
    endpoint,
    model,
    selected_provider: loadStoredSettings()?.selected_provider ?? 'codex-app-server',
    updated_at: new Date().toISOString()
  };
}

export function normalizeEndpoint(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 2048) throw new Error('invalid_byok_endpoint');
  let endpoint: URL;
  try {
    endpoint = new URL(normalized);
  } catch {
    throw new Error('invalid_byok_endpoint');
  }
  if (endpoint.username || endpoint.password || endpoint.hash) throw new Error('invalid_byok_endpoint');
  if (endpoint.protocol !== 'https:' && !isLoopbackHttp(endpoint)) {
    throw new Error('invalid_byok_endpoint');
  }
  return endpoint.toString();
}

function isLoopbackHttp(endpoint: URL) {
  if (endpoint.protocol !== 'http:') return false;
  const hostname = endpoint.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (hostname === 'localhost' || hostname === '::1') return true;
  return isIP(hostname) === 4 && hostname.startsWith('127.');
}

function loadStoredSettings(): StoredByokSettings | null {
  const value = loadJsonSetting(FOLIOLE_AIDE_BYOK_SETTINGS_KEY);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const stored = value as Partial<StoredByokSettings>;
  return typeof stored.endpoint === 'string' && typeof stored.model === 'string'
    && typeof stored.updated_at === 'string'
    ? {
        endpoint: stored.endpoint,
        model: stored.model,
        selected_provider: stored.selected_provider === 'openai-compatible'
          ? 'openai-compatible'
          : 'codex-app-server',
        updated_at: stored.updated_at
      }
    : null;
}

function readPreviousKey(previous: StoredByokSettings | null) {
  if (!previous || !hasDeviceSecret(SECRET_FILE)) return '';
  return readDeviceSecret(SECRET_FILE, SECRET_LABEL);
}

function restorePreviousKey(previousKey: string) {
  if (previousKey) writeDeviceSecret(SECRET_FILE, SECRET_LABEL, previousKey);
  else deleteDeviceSecret(SECRET_FILE);
}

function publicSettings(
  stored: StoredByokSettings,
  hasApiKey: boolean,
  state: NativeAssistantByokSettings['state']
): NativeAssistantByokSettings {
  return {
    endpoint: stored.endpoint,
    has_api_key: hasApiKey,
    model: stored.model,
    selected_provider: stored.selected_provider,
    state
  };
}

function emptySettings(): NativeAssistantByokSettings {
  return {
    endpoint: '',
    has_api_key: false,
    model: '',
    selected_provider: 'codex-app-server',
    state: 'not_configured'
  };
}
