import type {
  NativeAssistantByokSettings,
  NativeAssistantByokSettingsInput
} from '../../lib/platform/nativeAssistantByokContract.js';
import type { NativeAssistantProviderId } from '../../lib/platform/nativeAssistantContract.js';
import { NATIVE_ASSISTANT_CODEX_MODEL_ID } from '../../lib/platform/nativeAssistantModelSettingsContract.js';

import {
  deleteFolioleAideModel,
  FOLIOLE_AIDE_MODEL_SETTINGS_KEY,
  loadFolioleAideModelRuntimeConfig,
  loadFolioleAideModelSettings,
  normalizeEndpoint,
  selectFolioleAideModel,
  testAndSaveFolioleAideModel
} from './folioleAideModelSettings.js';

export const FOLIOLE_AIDE_BYOK_SETTINGS_KEY = FOLIOLE_AIDE_MODEL_SETTINGS_KEY;

export interface FolioleAideByokRuntimeConfig {
  apiKey: string;
  endpoint: string;
  model: string;
}

export function loadFolioleAideByokSettings(): NativeAssistantByokSettings {
  return toByokSettings(loadFolioleAideModelSettings());
}

function toByokSettings(
  settings: ReturnType<typeof loadFolioleAideModelSettings>
): NativeAssistantByokSettings {
  const selected = settings.models.find((model) => model.id === settings.selected_model_id);
  const visible = selected ?? settings.models[0];
  return visible ? {
    endpoint: visible.endpoint,
    has_api_key: visible.has_api_key,
    model: visible.model,
    selected_provider: selected ? 'openai-compatible' : 'codex-app-server',
    state: visible.state
  } : emptySettings();
}

export async function saveFolioleAideByokSettings(
  input: NativeAssistantByokSettingsInput
): Promise<NativeAssistantByokSettings> {
  const settings = loadFolioleAideModelSettings();
  const selected = settings.models.find((model) => model.id === settings.selected_model_id)
    ?? settings.models[0];
  const result = await testAndSaveFolioleAideModel({
    ...input,
    ...(selected ? { id: selected.id } : {})
  });
  if (result.state === 'failed') throw new Error(result.failure.category);
  return toByokSettings(result.settings);
}

export function disconnectFolioleAideByokSettings(): NativeAssistantByokSettings {
  const settings = loadFolioleAideModelSettings();
  const selected = settings.models.find((model) => model.id === settings.selected_model_id)
    ?? settings.models[0];
  if (selected) {
    if (settings.selected_model_id === selected.id) {
      selectFolioleAideModel(NATIVE_ASSISTANT_CODEX_MODEL_ID);
    }
    deleteFolioleAideModel(selected.id);
  }
  return loadFolioleAideByokSettings();
}

export function setFolioleAideProvider(provider: NativeAssistantProviderId) {
  if (provider === 'codex-app-server') {
    selectFolioleAideModel(NATIVE_ASSISTANT_CODEX_MODEL_ID);
  } else if (provider === 'openai-compatible') {
    const first = loadFolioleAideModelSettings().models.find((model) => model.state === 'configured');
    if (!first) throw new Error('byok_not_configured');
    selectFolioleAideModel(first.id);
  } else {
    throw new Error('invalid_assistant_provider');
  }
  return loadFolioleAideByokSettings();
}

export function loadFolioleAideByokRuntimeConfig(): FolioleAideByokRuntimeConfig {
  return loadFolioleAideModelRuntimeConfig();
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

export { normalizeEndpoint };
