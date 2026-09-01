// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  secrets: new Map<string, string>(),
  setting: null as unknown
}));
const toolProbe = vi.hoisted(() => vi.fn());

vi.mock('./openAiCompatibleModelToolProbe.js', () => ({
  probeOpenAiCompatibleModelTools: toolProbe
}));

vi.mock('../database/settingsStore.js', () => ({
  loadJsonSetting: () => state.setting,
  saveJsonSetting: (_key: string, value: unknown) => { state.setting = value; }
}));

vi.mock('../security/publishDeviceSecretStore.js', () => ({
  deletePublishDeviceSecret: (file: string) => state.secrets.delete(file),
  hasPublishDeviceSecret: (file: string) => state.secrets.has(file),
  readPublishDeviceSecret: (file: string) => state.secrets.get(file) ?? '',
  writePublishDeviceSecret: (file: string, _label: string, value: string) => {
    state.secrets.set(file, value);
  }
}));

import {
  deleteFolioleAideModel,
  loadFolioleAideModelRuntimeConfig,
  loadFolioleAideModelSettings,
  selectFolioleAideModel,
  testAndSaveFolioleAideModel
} from './folioleAideModelSettings.js';

beforeEach(() => {
  state.secrets.clear();
  state.setting = null;
  toolProbe.mockReset();
  toolProbe.mockResolvedValue(null);
});

it('adds multiple tested models without storing API keys in public settings', async () => {
  const first = await addModel('model-a', 'key-a');
  const second = await addModel('model-b', 'key-b');

  expect(first.state).toBe('ready');
  expect(second.state).toBe('ready');
  expect(loadFolioleAideModelSettings().models.map((model) => model.model))
    .toEqual(['model-a', 'model-b']);
  expect(JSON.stringify(state.setting)).not.toContain('key-a');
  expect(JSON.stringify(state.setting)).not.toContain('key-b');
});

it('keeps exactly one global model selected and protects it from deletion', async () => {
  const result = await addModel('model-a', 'key-a');
  if (result.state !== 'ready') throw new Error('test_setup_failed');
  const id = result.settings.models[0]?.id ?? '';

  expect(selectFolioleAideModel(id).selected_model_id).toBe(id);
  expect(() => deleteFolioleAideModel(id)).toThrow('active_model_cannot_be_deleted');
  expect(selectFolioleAideModel('codex').selected_model_id).toBe('codex');
  expect(deleteFolioleAideModel(id).models).toEqual([]);
});

it('persists a failed model and its secure key without making it selectable', async () => {
  toolProbe.mockResolvedValueOnce('auth_failed');
  const result = await addModel('model-a', 'bad-key');

  expect(result).toMatchObject({ state: 'failed', failure: { category: 'auth_failed' } });
  const reloaded = loadFolioleAideModelSettings();
  expect(reloaded).toMatchObject({
    models: [{
      endpoint: 'https://models.example/v1/chat/completions',
      has_api_key: true,
      model: 'model-a',
      state: 'not_configured'
    }],
    selected_model_id: 'codex'
  });
  expect(() => selectFolioleAideModel(reloaded.models[0]?.id ?? '')).toThrow('model_not_configured');
  expect(JSON.stringify(state.setting)).not.toContain('bad-key');
  expect([...state.secrets.values()]).toEqual(['bad-key']);
});

it('preserves the last qualified model and secret when a changed retest fails', async () => {
  const ready = await addModel('model-a', 'old-key');
  if (ready.state !== 'ready') throw new Error('test_setup_failed');
  const id = ready.settings.models[0]?.id ?? '';
  selectFolioleAideModel(id);
  toolProbe.mockResolvedValueOnce('auth_failed');

  const failed = await testAndSaveFolioleAideModel({
    api_key: 'new-key',
    endpoint: 'https://second.example/v1/chat/completions',
    id,
    model: 'model-b'
  });

  expect(failed).toMatchObject({
    settings: {
      models: [{ endpoint: 'https://models.example/v1/chat/completions', model: 'model-a', state: 'configured' }],
      selected_model_id: id
    },
    state: 'failed'
  });
  expect([...state.secrets.values()]).toEqual(['old-key']);
  expect(loadFolioleAideModelRuntimeConfig()).toMatchObject({ model: 'model-a' });
});

it('preserves a legacy selected id and secure key while requiring current tool qualification', () => {
  state.setting = {
    endpoint: 'https://models.example/v1/chat/completions',
    model: 'legacy-model',
    selected_provider: 'openai-compatible',
    updated_at: '2026-08-31T00:00:00.000Z'
  };
  state.secrets.set('foliole-aide-byok-secret.bin', 'legacy-key');

  const settings = loadFolioleAideModelSettings();
  expect(settings).toMatchObject({
    models: [{ id: 'imported-model', model: 'legacy-model' }],
    selected_model_id: 'imported-model'
  });
  expect(settings.models[0]?.state).toBe('not_configured');
  expect(() => loadFolioleAideModelRuntimeConfig()).toThrow('byok_not_configured');
  expect(state.setting).toMatchObject({ version: 2 });
});

async function addModel(model: string, apiKey: string) {
  return testAndSaveFolioleAideModel({
    api_key: apiKey,
    endpoint: 'https://models.example/v1/chat/completions',
    model
  });
}
