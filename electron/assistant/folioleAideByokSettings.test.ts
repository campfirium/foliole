// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  failSave: false,
  secret: '',
  setting: null as unknown
}));

vi.mock('../database/settingsStore.js', () => ({
  loadJsonSetting: () => state.setting,
  saveJsonSetting: (_key: string, value: unknown) => {
    if (state.failSave) throw new Error('settings_write_failed');
    state.setting = value;
  }
}));

vi.mock('../security/publishDeviceSecretStore.js', () => ({
  deletePublishDeviceSecret: () => {
    const existed = Boolean(state.secret);
    state.secret = '';
    return existed;
  },
  hasPublishDeviceSecret: () => Boolean(state.secret),
  readPublishDeviceSecret: () => {
    if (state.secret === 'unavailable') throw new Error('secure_storage_unavailable');
    return state.secret;
  },
  writePublishDeviceSecret: (_file: string, _label: string, value: string) => {
    state.secret = value;
  }
}));

import {
  disconnectFolioleAideByokSettings,
  FOLIOLE_AIDE_BYOK_SETTINGS_KEY,
  loadFolioleAideByokSettings,
  normalizeEndpoint,
  saveFolioleAideByokSettings,
  setFolioleAideProvider
} from './folioleAideByokSettings.js';

beforeEach(() => {
  state.failSave = false;
  state.secret = '';
  state.setting = null;
});

it('accepts HTTPS and loopback HTTP endpoints only', () => {
  expect(normalizeEndpoint('https://models.example/v1/chat/completions'))
    .toBe('https://models.example/v1/chat/completions');
  expect(normalizeEndpoint('http://127.0.0.1:8080/v1/chat/completions'))
    .toBe('http://127.0.0.1:8080/v1/chat/completions');
  expect(() => normalizeEndpoint('http://models.example/v1/chat/completions'))
    .toThrow('invalid_byok_endpoint');
  expect(() => normalizeEndpoint('https://user:secret@models.example/v1#key'))
    .toThrow('invalid_byok_endpoint');
});

it('stores only public settings and never returns the API key', () => {
  const result = saveFolioleAideByokSettings({
    api_key: 'secret-key',
    endpoint: 'https://models.example/v1/chat/completions',
    model: 'model-a'
  });

  expect(result).toEqual({
    endpoint: 'https://models.example/v1/chat/completions',
    has_api_key: true,
    model: 'model-a',
    selected_provider: 'codex-app-server',
    state: 'configured'
  });
  expect(JSON.stringify(state.setting)).not.toContain('secret-key');
  expect(FOLIOLE_AIDE_BYOK_SETTINGS_KEY).toBe('foliole_aide_byok_settings');
});

it('requires a new key when the endpoint changes', () => {
  saveFolioleAideByokSettings({
    api_key: 'old-key',
    endpoint: 'https://one.example/v1/chat/completions',
    model: 'model-a'
  });

  expect(() => saveFolioleAideByokSettings({
    endpoint: 'https://two.example/v1/chat/completions',
    model: 'model-b'
  })).toThrow('byok_api_key_required_for_endpoint');
  expect(loadFolioleAideByokSettings().endpoint)
    .toBe('https://one.example/v1/chat/completions');
  expect(state.secret).toBe('old-key');
});

it('persists only a configured new-conversation provider and resets it on disconnect', () => {
  expect(() => setFolioleAideProvider('openai-compatible')).toThrow('byok_not_configured');
  saveFolioleAideByokSettings({
    api_key: 'secret-key',
    endpoint: 'https://models.example/v1/chat/completions',
    model: 'model-a'
  });

  expect(setFolioleAideProvider('openai-compatible').selected_provider).toBe('openai-compatible');
  expect(JSON.stringify(state.setting)).not.toContain('secret-key');
  expect(disconnectFolioleAideByokSettings().selected_provider).toBe('codex-app-server');
});

it('restores the previous secret when the public settings write fails', () => {
  saveFolioleAideByokSettings({
    api_key: 'old-key',
    endpoint: 'https://one.example/v1/chat/completions',
    model: 'model-a'
  });
  state.failSave = true;

  expect(() => saveFolioleAideByokSettings({
    api_key: 'new-key',
    endpoint: 'https://two.example/v1/chat/completions',
    model: 'model-b'
  })).toThrow('settings_write_failed');
  expect(state.secret).toBe('old-key');
});

it('reports unavailable secure storage without exposing the secret', () => {
  state.setting = {
    endpoint: 'https://models.example/v1/chat/completions',
    model: 'model-a',
    updated_at: '2026-08-31T00:00:00.000Z'
  };
  state.secret = 'unavailable';

  expect(loadFolioleAideByokSettings()).toMatchObject({
    has_api_key: true,
    state: 'secure_storage_unavailable'
  });
});

it('disconnects without leaving a public or secret configuration', () => {
  saveFolioleAideByokSettings({
    api_key: 'secret-key',
    endpoint: 'https://models.example/v1/chat/completions',
    model: 'model-a'
  });

  expect(disconnectFolioleAideByokSettings()).toEqual({
    endpoint: '', has_api_key: false, model: '', selected_provider: 'codex-app-server', state: 'not_configured'
  });
  expect(state.secret).toBe('');
  expect(state.setting).toBeNull();
});
