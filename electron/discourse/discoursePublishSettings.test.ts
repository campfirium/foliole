import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  secret: '',
  setting: null as unknown
}));

vi.mock('../database/settingsStore.js', () => ({
  loadJsonSetting: () => state.setting,
  saveJsonSetting: (_key: string, value: unknown) => {
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
  readPublishDeviceSecret: () => state.secret,
  writePublishDeviceSecret: (_file: string, _label: string, value: string) => {
    state.secret = value;
  }
}));

import {
  disconnectDiscoursePublishSettings,
  loadDiscourseApiKey,
  loadDiscoursePublishSettings,
  saveDiscoursePublishSettings
} from './discoursePublishSettings.js';

beforeEach(() => {
  state.secret = '';
  state.setting = null;
});

it('keeps the API key outside the persisted setting payload', () => {
  saveDiscoursePublishSettings({
    api_key: 'SENTINEL-DISCOURSE-SECRET',
    site_url: 'https://forum.example.com/'
  });

  expect(loadDiscourseApiKey()).toBe('SENTINEL-DISCOURSE-SECRET');
  expect(loadDiscoursePublishSettings()).toMatchObject({
    has_api_key: true,
    site_url: 'https://forum.example.com'
  });
  expect(JSON.stringify(state.setting)).not.toContain('SENTINEL-DISCOURSE-SECRET');
});

it('clears the previous key and site-specific state when the site changes', () => {
  state.secret = 'old-secret';
  state.setting = {
    catalog_cache: { categories: [], fetched_at: 'now', site_url: 'https://old.example.com', tags: [] },
    recent_by_site: { 'https://old.example.com': { category_ids: [1], tags: ['old'] } },
    site_url: 'https://old.example.com',
    updated_at: '2026-07-16T00:00:00.000Z'
  };

  const saved = saveDiscoursePublishSettings({ site_url: 'https://new.example.com' });

  expect(saved).toMatchObject({ has_api_key: false, site_url: 'https://new.example.com' });
  expect(loadDiscourseApiKey()).toBe('');
  expect(state.setting).not.toHaveProperty('catalog_cache');
  expect(state.setting).not.toHaveProperty('recent_by_site');
});

it('disconnects by deleting the key and clearing the site', () => {
  saveDiscoursePublishSettings({ api_key: 'secret', site_url: 'https://forum.example.com' });

  expect(disconnectDiscoursePublishSettings()).toMatchObject({ has_api_key: false, site_url: '' });
  expect(loadDiscourseApiKey()).toBe('');
});
