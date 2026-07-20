import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ secret: '', setting: null as unknown, shouldFailSave: false }));

vi.mock('../database/settingsStore.js', () => ({
  loadJsonSetting: () => state.setting,
  saveJsonSetting: (_key: string, value: unknown) => {
    if (state.shouldFailSave) throw new Error('save failed');
    state.setting = value;
  }
}));

vi.mock('../security/publishDeviceSecretStore.js', () => ({
  deletePublishDeviceSecret: () => { state.secret = ''; return true; },
  hasPublishDeviceSecret: () => Boolean(state.secret),
  readPublishDeviceSecret: () => state.secret,
  writePublishDeviceSecret: (_file: string, _label: string, value: string) => { state.secret = value; }
}));

import { loadFoliolePublishSettings, saveFoliolePublishConnection } from './foliolePublishSettings.js';

beforeEach(() => { state.secret = ''; state.setting = null; state.shouldFailSave = false; });

it('stores the Cloudflare token outside the settings payload', () => {
  const saved = saveFoliolePublishConnection({
    account_id: 'account', api_token: 'SENTINEL-TOKEN', project_name: 'My-Site', site_address: ''
  }, 'https://my-site.pages.dev');

  expect(saved).toMatchObject({ has_credentials: true, project_name: 'my-site', site_address: 'https://my-site.pages.dev' });
  expect(state.secret).toBe('SENTINEL-TOKEN');
  expect(JSON.stringify(state.setting)).not.toContain('SENTINEL-TOKEN');
});

it('restores the previous token when saving non-secret settings fails', () => {
  state.secret = 'previous-token';
  state.shouldFailSave = true;

  expect(() => saveFoliolePublishConnection({
    account_id: 'account', api_token: 'new-token', project_name: 'site', site_address: ''
  }, 'https://site.pages.dev')).toThrow('save failed');
  expect(state.secret).toBe('previous-token');
  expect(loadFoliolePublishSettings().has_credentials).toBe(false);
});
