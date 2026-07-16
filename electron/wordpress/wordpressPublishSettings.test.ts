import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ failSave: false, secret: '', setting: null as unknown }));
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
  readPublishDeviceSecret: () => state.secret,
  writePublishDeviceSecret: (_file: string, _label: string, value: string) => { state.secret = value; }
}));
vi.mock('./wordpressClient.js', () => ({ verifyWordPressConnection: verifyMock }));

import {
  connectWordPressPublishSettings,
  disconnectWordPressPublishSettings,
  loadWordPressCredential,
  loadWordPressPublishSettings
} from './wordpressPublishSettings.js';

beforeEach(() => {
  state.secret = '';
  state.setting = null;
  state.failSave = false;
  verifyMock.mockReset();
  verifyMock.mockResolvedValue({
    adapter: 'wordpress_com_xmlrpc',
    blogId: '91',
    endpoint: 'https://free-site.wordpress.com/xmlrpc.php',
    siteUrl: 'https://free-site.wordpress.com'
  });
});

it('stores credentials only in the encrypted secret and returns a redacted status', async () => {
  const settings = await connectWordPressPublishSettings({
    application_password: 'SENTINEL-WORDPRESS-SECRET',
    site_url: 'https://free-site.wordpress.com',
    username: 'SENTINEL-WORDPRESS-USER'
  });

  expect(settings).toMatchObject({ adapter: 'wordpress_com_xmlrpc', has_credentials: true });
  expect(JSON.stringify(state.setting)).not.toContain('SENTINEL-WORDPRESS-SECRET');
  expect(JSON.stringify(state.setting)).not.toContain('SENTINEL-WORDPRESS-USER');
  expect(JSON.stringify(settings)).not.toContain('SENTINEL-WORDPRESS');
  expect(loadWordPressCredential()).toMatchObject({ username: 'SENTINEL-WORDPRESS-USER' });
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

it('disconnects without returning the stored username or password', async () => {
  await connectWordPressPublishSettings({
    application_password: 'secret', site_url: 'https://free-site.wordpress.com', username: 'writer'
  });
  expect(disconnectWordPressPublishSettings()).toEqual({
    adapter: null, has_credentials: false, site_url: '', updated_at: null
  });
  expect(state.secret).toBe('');
  expect(loadWordPressPublishSettings()).toEqual({
    adapter: null, has_credentials: false, site_url: '', updated_at: null
  });
});
