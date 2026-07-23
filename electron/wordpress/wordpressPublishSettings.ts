import {
  normalizeWordPressApplicationPassword,
  normalizeWordPressSiteUrl
} from '../../lib/core/wordpress/wordpressConnectionInput.js';
import type {
  NativeWordPressConnectInput,
  NativeWordPressDraftInput,
  NativeWordPressPublishAdapter,
  NativeWordPressPublishSettings
} from '../../lib/platform/nativeWordPressPublishContract.js';
import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';
import {
  deletePublishDeviceSecret,
  hasPublishDeviceSecret,
  readPublishDeviceSecret,
  writePublishDeviceSecret
} from '../security/publishDeviceSecretStore.js';

import {
  resolveWordPressAdapter,
  verifyWordPressConnection,
  type WordPressCredential
} from './wordpressClient.js';

const SETTINGS_KEY = 'wordpress_publish_settings';
const SECRET_FILE = 'wordpress-publish-credentials.bin';

export interface StoredWordPressPublishSettings {
  adapter: NativeWordPressPublishAdapter;
  blog_id: string | null;
  endpoint: string;
  site_url: string;
  updated_at: string;
  username?: string;
}

function emptySettings(): NativeWordPressPublishSettings {
  return {
    adapter: null, credentials_valid: false, has_credentials: false,
    site_url: '', updated_at: null, username: ''
  };
}

function isStoredSettings(value: unknown): value is StoredWordPressPublishSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    (record.adapter === 'core_rest' || record.adapter === 'wordpress_com_xmlrpc') &&
    (record.blog_id === null || typeof record.blog_id === 'string') &&
    typeof record.endpoint === 'string' &&
    typeof record.site_url === 'string' &&
    typeof record.updated_at === 'string' &&
    (record.username === undefined || typeof record.username === 'string')
  );
}

export function loadStoredWordPressPublishSettings() {
  const value = loadJsonSetting(SETTINGS_KEY);
  return isStoredSettings(value) ? value : null;
}

function readCredential() {
  if (!hasPublishDeviceSecret(SECRET_FILE)) return null;
  try {
    const parsed = JSON.parse(readPublishDeviceSecret(SECRET_FILE, 'WordPress publishing credentials')) as WordPressCredential;
    return parsed && typeof parsed.username === 'string' && typeof parsed.applicationPassword === 'string'
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function loadWordPressCredential(settings = loadStoredWordPressPublishSettings()) {
  const credential = readCredential();
  if (!settings || !credential || credential.siteUrl !== settings.site_url || credential.adapter !== settings.adapter) return null;
  return credential;
}

export function loadWordPressPublishSettings(): NativeWordPressPublishSettings {
  const settings = loadStoredWordPressPublishSettings();
  if (!settings) return emptySettings();
  const credential = loadWordPressCredential(settings);
  return {
    adapter: settings.adapter,
    credentials_valid: Boolean(settings.endpoint && credential),
    has_credentials: Boolean(credential),
    site_url: settings.site_url,
    updated_at: settings.updated_at,
    username: settings.username ?? credential?.username ?? ''
  };
}

function draftSiteUrl(value: string) {
  try { return normalizeWordPressSiteUrl(value); } catch { return value.trim(); }
}

function restoreSecret(previous: string | null) {
  if (previous === null) deletePublishDeviceSecret(SECRET_FILE);
  else writePublishDeviceSecret(SECRET_FILE, 'WordPress publishing credentials', previous);
}

export function saveWordPressPublishDraft(input: NativeWordPressDraftInput) {
  const current = loadStoredWordPressPublishSettings();
  if (current?.endpoint && loadWordPressCredential(current)) return loadWordPressPublishSettings();
  const siteUrl = draftSiteUrl(input.site_url);
  const adapter = resolveWordPressAdapter(siteUrl);
  const username = input.username.trim();
  const applicationPassword = normalizeWordPressApplicationPassword(input.application_password);
  const updatedAt = new Date().toISOString();
  const previousSecret = hasPublishDeviceSecret(SECRET_FILE)
    ? readPublishDeviceSecret(SECRET_FILE, 'WordPress publishing credentials')
    : null;
  try {
    if (applicationPassword) {
      writePublishDeviceSecret(SECRET_FILE, 'WordPress publishing credentials', JSON.stringify({
        adapter, applicationPassword, siteUrl, username
      } satisfies WordPressCredential));
    }
    saveJsonSetting(SETTINGS_KEY, {
      adapter, blog_id: null, endpoint: '', site_url: siteUrl, updated_at: updatedAt, username
    } satisfies StoredWordPressPublishSettings, updatedAt);
  } catch (error) {
    try { restoreSecret(previousSecret); } catch { deletePublishDeviceSecret(SECRET_FILE); }
    throw error;
  }
  return loadWordPressPublishSettings();
}

export async function connectWordPressPublishSettings(input: NativeWordPressConnectInput) {
  const savedCredential = loadWordPressCredential();
  const applicationPassword = normalizeWordPressApplicationPassword(input.application_password)
    || savedCredential?.applicationPassword
    || '';
  const verified = await verifyWordPressConnection({
    applicationPassword,
    siteUrl: input.site_url,
    username: input.username
  });
  const updatedAt = new Date().toISOString();
  const credential: WordPressCredential = {
    adapter: verified.adapter,
    applicationPassword,
    siteUrl: verified.siteUrl,
    username: input.username.trim()
  };
  const previousSecret = hasPublishDeviceSecret(SECRET_FILE)
    ? readPublishDeviceSecret(SECRET_FILE, 'WordPress publishing credentials')
    : null;
  try {
    writePublishDeviceSecret(SECRET_FILE, 'WordPress publishing credentials', JSON.stringify(credential));
    saveJsonSetting(SETTINGS_KEY, {
      adapter: verified.adapter,
      blog_id: verified.blogId,
      endpoint: verified.endpoint,
      site_url: verified.siteUrl,
      updated_at: updatedAt,
      username: input.username.trim()
    } satisfies StoredWordPressPublishSettings, updatedAt);
  } catch (error) {
    try {
      restoreSecret(previousSecret);
    } catch {
      deletePublishDeviceSecret(SECRET_FILE);
    }
    throw error;
  }
  return loadWordPressPublishSettings();
}

export function disconnectWordPressPublishSettings() {
  deletePublishDeviceSecret(SECRET_FILE);
  const updatedAt = new Date().toISOString();
  saveJsonSetting(SETTINGS_KEY, null, updatedAt);
  return emptySettings();
}
