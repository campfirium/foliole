import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  failSave: false,
  readSecret: vi.fn(() => state.secret),
  secret: '',
  setting: null as unknown
}));
const verifyMock = vi.hoisted(() => vi.fn());

vi.mock('../database/settingsStore.js', () => ({
  loadJsonSetting: () => state.setting,
  saveJsonSetting: (_key: string, value: unknown) => {
    if (state.failSave) throw new Error('database unavailable');
    state.setting = value;
  }
}));
vi.mock('../security/publishDeviceSecretStore.js', () => ({
  deletePublishDeviceSecret: () => { state.secret = ''; return true; },
  hasPublishDeviceSecret: () => Boolean(state.secret),
  readPublishDeviceSecret: state.readSecret,
  writePublishDeviceSecret: (_file: string, _label: string, value: string) => { state.secret = value; }
}));
vi.mock('./wordpressClient.js', () => ({
  resolveWordPressAdapter: (siteUrl: string) => siteUrl.includes('wordpress.com')
    ? 'wordpress_com_xmlrpc'
    : 'core_rest',
  verifyWordPressConnection: verifyMock
}));

import {
  connectWordPressPublishSettings,
  disconnectWordPressPublishSettings,
  loadWordPressCredential,
  loadWordPressPublishSettings,
  saveWordPressPublishDraft
} from './wordpressPublishSettings.js';

beforeEach(() => {
  state.secret = '';
  state.setting = null;
  state.failSave = false;
  state.readSecret.mockClear();
  verifyMock.mockReset();
  verifyMock.mockResolvedValue({
    adapter: 'wordpress_com_xmlrpc',
    blogId: '91',
    endpoint: 'https://free-site.wordpress.com/xmlrpc.php',
    siteUrl: 'https://free-site.wordpress.com'
  });
});

it('loads saved credential status without opening the encrypted password', () => {
  state.secret = JSON.stringify({ applicationPassword: 'secret' });
  state.setting = {
    adapter: 'core_rest', blog_id: null, endpoint: 'https://blog.example.com/wp-json/wp/v2',
    site_url: 'https://blog.example.com', updated_at: '2026-08-22T00:00:00.000Z', username: 'writer'
  };

  expect(loadWordPressPublishSettings()).toMatchObject({
    credentials_valid: true, has_credentials: true, username: 'writer'
  });
  expect(state.readSecret).not.toHaveBeenCalled();
});

it('stores credentials only in the encrypted secret and returns a redacted status', async () => {
  const settings = await connectWordPressPublishSettings({
    application_password: 'SENTINEL-WORDPRESS-SECRET',
    site_url: 'https://free-site.wordpress.com',
    username: 'SENTINEL-WORDPRESS-USER'
  });

  expect(settings).toMatchObject({ adapter: 'wordpress_com_xmlrpc', has_credentials: true });
  expect(JSON.stringify(state.setting)).not.toContain('SENTINEL-WORDPRESS-SECRET');
  expect(state.setting).toMatchObject({ username: 'SENTINEL-WORDPRESS-USER' });
  expect(JSON.stringify(settings)).not.toContain('SENTINEL-WORDPRESS-SECRET');
  expect(settings.username).toBe('SENTINEL-WORDPRESS-USER');
  expect(loadWordPressCredential()).toMatchObject({ username: 'SENTINEL-WORDPRESS-USER' });
});

it('persists a username before an Application Password is entered', () => {
  const draft = saveWordPressPublishDraft({
    application_password: '', site_url: 'folioleapp.wordpress.com', username: 'folioleapp'
  });

  expect(draft).toMatchObject({
    credentials_valid: false, has_credentials: false,
    site_url: 'https://folioleapp.wordpress.com', username: 'folioleapp'
  });
  expect(state.setting).toMatchObject({ username: 'folioleapp' });
  expect(state.secret).toBe('');
  expect(loadWordPressPublishSettings()).toMatchObject({ username: 'folioleapp' });
});

it('does not replace a working credential when verification fails', async () => {
  state.secret = JSON.stringify({
    adapter: 'core_rest', applicationPassword: 'old', siteUrl: 'https://blog.example.com', username: 'writer'
  });
  state.setting = {
    adapter: 'core_rest', blog_id: null, endpoint: 'https://blog.example.com/wp-json/wp/v2',
    site_url: 'https://blog.example.com', updated_at: '2026-07-16T00:00:00.000Z'
  };
  verifyMock.mockRejectedValue(new Error('connection rejected'));

  await expect(connectWordPressPublishSettings({
    application_password: 'new', site_url: 'https://other.example.com', username: 'writer'
  })).rejects.toThrow('connection rejected');
  expect(loadWordPressPublishSettings()).toMatchObject({ has_credentials: true, site_url: 'https://blog.example.com' });
});

it('keeps an unverified draft after connection failure without exposing its password', async () => {
  const draft = saveWordPressPublishDraft({
    application_password: 'SENTINEL-WORDPRESS-DRAFT',
    site_url: 'folioleapp.wordpress.com',
    username: 'folioleapp'
  });
  expect(draft).toEqual({
    adapter: 'wordpress_com_xmlrpc', credentials_valid: false, has_credentials: true,
    site_url: 'https://folioleapp.wordpress.com', updated_at: expect.any(String), username: 'folioleapp'
  });
  expect(JSON.stringify(state.setting)).not.toContain('SENTINEL-WORDPRESS-DRAFT');
  expect(JSON.stringify(draft)).not.toContain('SENTINEL-WORDPRESS-DRAFT');

  verifyMock.mockRejectedValue(new Error('connection rejected'));
  await expect(connectWordPressPublishSettings({
    application_password: '', site_url: draft.site_url, username: draft.username
  })).rejects.toThrow('connection rejected');
  expect(loadWordPressPublishSettings()).toMatchObject({
    credentials_valid: false, has_credentials: true,
    site_url: 'https://folioleapp.wordpress.com', username: 'folioleapp'
  });
});

it('restores the previous credential when the non-secret setting cannot be saved', async () => {
  state.secret = JSON.stringify({
    adapter: 'core_rest', applicationPassword: 'old', siteUrl: 'https://blog.example.com', username: 'writer'
  });
  state.setting = {
    adapter: 'core_rest', blog_id: null, endpoint: 'https://blog.example.com/wp-json/wp/v2',
    site_url: 'https://blog.example.com', updated_at: '2026-07-16T00:00:00.000Z'
  };
  state.failSave = true;

  await expect(connectWordPressPublishSettings({
    application_password: 'new', site_url: 'https://free-site.wordpress.com', username: 'writer'
  })).rejects.toThrow('database unavailable');
  expect(JSON.parse(state.secret)).toMatchObject({ applicationPassword: 'old', siteUrl: 'https://blog.example.com' });
});

it('retains taxonomy cache only when the verified site and adapter still match', async () => {
  state.setting = {
    adapter: 'wordpress_com_xmlrpc', blog_id: '91', endpoint: 'https://free-site.wordpress.com/xmlrpc.php',
    catalog_cache: {
      adapter: 'wordpress_com_xmlrpc', categories: [], fetched_at: 'cached',
      site_url: 'https://free-site.wordpress.com', tags: []
    },
    site_url: 'https://free-site.wordpress.com', updated_at: '2026-07-24T00:00:00.000Z'
  };
  await connectWordPressPublishSettings({
    application_password: 'secret', site_url: 'https://free-site.wordpress.com', username: 'writer'
  });
  expect(state.setting).toHaveProperty('catalog_cache.fetched_at', 'cached');

  verifyMock.mockResolvedValueOnce({
    adapter: 'core_rest', blogId: null,
    endpoint: 'https://other.example.com/wp-json/wp/v2', siteUrl: 'https://other.example.com'
  });
  await connectWordPressPublishSettings({
    application_password: 'secret', site_url: 'https://other.example.com', username: 'writer'
  });
  expect(state.setting).not.toHaveProperty('catalog_cache');
});

it('disconnects without returning the stored username or password', async () => {
  await connectWordPressPublishSettings({
    application_password: 'secret', site_url: 'https://free-site.wordpress.com', username: 'writer'
  });
  expect(disconnectWordPressPublishSettings()).toEqual({
    adapter: null, credentials_valid: false, has_credentials: false,
    site_url: '', updated_at: null, username: ''
  });
  expect(state.secret).toBe('');
  expect(loadWordPressPublishSettings()).toEqual({
    adapter: null, credentials_valid: false, has_credentials: false,
    site_url: '', updated_at: null, username: ''
  });
});
