import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  readSecret: vi.fn(() => state.secret),
  secret: '', setting: null as unknown, shouldFailSave: false, shouldFailSecretWrite: false
}));

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
  readPublishDeviceSecret: state.readSecret,
  writePublishDeviceSecret: (_file: string, _label: string, value: string) => {
    if (state.shouldFailSecretWrite) throw new Error('secret write failed');
    state.secret = value;
  }
}));

import { loadFoliolePublishSettings, loadStoredFoliolePublishSettings, recordFoliolePublishFields, saveFoliolePublishConnection, saveFoliolePublishDraft } from './foliolePublishSettings.js';

beforeEach(() => {
  state.secret = ''; state.setting = null; state.shouldFailSave = false; state.shouldFailSecretWrite = false;
  state.readSecret.mockClear();
});

it('loads saved credential status without opening the encrypted token', () => {
  state.secret = VALID_TOKEN;
  state.setting = {
    account_id: 'account', pages_url: 'https://site.pages.dev', project_name: 'site',
    site_address: 'https://site.pages.dev', updated_at: '2026-08-22T00:00:00.000Z'
  };

  expect(loadFoliolePublishSettings()).toMatchObject({ credentials_valid: true, has_credentials: true });
  expect(state.readSecret).not.toHaveBeenCalled();
});

const VALID_TOKEN = 'Sn3lZJTBX6kkg7OdcBUAxOO963GEIyGQqnFTOFYY';

it('persists a draft without exposing the token or treating it as deployed', () => {
  const saved = saveFoliolePublishDraft({
    account_id: ' account ', api_token: VALID_TOKEN, project_name: 'my-site'
  });

  expect(saved).toMatchObject({
    account_id: 'account', credentials_valid: true, has_credentials: true,
    pages_url: '', project_name: 'my-site', site_address: ''
  });
  expect(state.secret).toBe(VALID_TOKEN);
  expect(JSON.stringify(state.setting)).not.toContain(VALID_TOKEN);
  expect(loadStoredFoliolePublishSettings()).toBeNull();
});

it('preserves the saved token when later draft fields omit it', () => {
  saveFoliolePublishDraft({ account_id: 'account', api_token: VALID_TOKEN, project_name: 'first' });
  const saved = saveFoliolePublishDraft({ account_id: 'account-2', api_token: '', project_name: 'second' });
  expect(saved).toMatchObject({ credentials_valid: true, project_name: 'second' });
  expect(state.secret).toBe(VALID_TOKEN);
});

it('does not let a draft overwrite an established connection', () => {
  const connected = saveFoliolePublishConnection({
    account_id: 'account', api_token: VALID_TOKEN, project_name: 'site', site_address: ''
  }, 'https://site.pages.dev');
  const saved = saveFoliolePublishDraft({ account_id: 'other', api_token: 'replacement', project_name: 'other' });
  expect(saved).toMatchObject({ pages_url: connected.pages_url, project_name: 'site' });
  expect(state.secret).toBe(VALID_TOKEN);
});

it('does not write draft settings when encrypted token storage fails', () => {
  state.shouldFailSecretWrite = true;
  expect(() => saveFoliolePublishDraft({
    account_id: 'account', api_token: VALID_TOKEN, project_name: 'site'
  })).toThrow('secret write failed');
  expect(state.setting).toBeNull();
});

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

it('keeps field history for the same site and clears it when the site changes', () => {
  const connect = (project_name: string) => saveFoliolePublishConnection({
    account_id: 'account', api_token: 'token', project_name, site_address: ''
  }, `https://${project_name}.pages.dev`);
  connect('site');
  recordFoliolePublishFields([{ key: 'category', value: 'notes' }]);
  expect(connect('site').field_catalog).toHaveLength(1);
  expect(connect('other').field_catalog).toEqual([]);
});
