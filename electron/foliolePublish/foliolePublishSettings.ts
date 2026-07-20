import type { NativeFoliolePublishConnectInput, NativeFoliolePublishSettings } from '../../lib/platform/nativeFoliolePublishContract.js';
import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';
import { deletePublishDeviceSecret, hasPublishDeviceSecret, readPublishDeviceSecret, writePublishDeviceSecret } from '../security/publishDeviceSecretStore.js';

import { normalizeCloudflareProjectName, normalizeSiteAddress } from './cloudflarePagesClient.js';

const SETTINGS_KEY = 'foliole_publish_settings';
const SECRET_FILE = 'foliole-publish-cloudflare-token.bin';

interface StoredSettings {
  account_id: string;
  pages_url: string;
  project_name: string;
  site_address: string;
  updated_at: string;
}

function empty(): NativeFoliolePublishSettings {
  return { account_id: '', has_credentials: false, pages_url: '', project_name: '', site_address: '', updated_at: null };
}

function stored(): StoredSettings | null {
  const value = loadJsonSetting(SETTINGS_KEY) as Partial<StoredSettings> | null;
  return value && typeof value.account_id === 'string' && typeof value.pages_url === 'string' &&
    typeof value.project_name === 'string' && typeof value.site_address === 'string' && typeof value.updated_at === 'string'
    ? value as StoredSettings : null;
}

export function loadFoliolePublishToken() {
  if (!hasPublishDeviceSecret(SECRET_FILE)) return '';
  try { return readPublishDeviceSecret(SECRET_FILE, 'Cloudflare Pages API token'); } catch { return ''; }
}

export function loadFoliolePublishSettings(): NativeFoliolePublishSettings {
  const value = stored();
  return value ? { ...value, has_credentials: Boolean(loadFoliolePublishToken()) } : empty();
}

export function saveFoliolePublishConnection(input: NativeFoliolePublishConnectInput, pagesUrl: string) {
  const updatedAt = new Date().toISOString();
  const value: StoredSettings = {
    account_id: input.account_id.trim(), pages_url: normalizeSiteAddress(pagesUrl),
    project_name: normalizeCloudflareProjectName(input.project_name),
    site_address: normalizeSiteAddress(input.site_address) || normalizeSiteAddress(pagesUrl), updated_at: updatedAt
  };
  if (!value.account_id || !input.api_token.trim()) throw new Error('Enter a Cloudflare Account ID and authorization result.');
  const previousSecret = loadFoliolePublishToken() || null;
  try {
    writePublishDeviceSecret(SECRET_FILE, 'Cloudflare Pages API token', input.api_token.trim());
    saveJsonSetting(SETTINGS_KEY, value, updatedAt);
  } catch (error) {
    try {
      if (previousSecret === null) deletePublishDeviceSecret(SECRET_FILE);
      else writePublishDeviceSecret(SECRET_FILE, 'Cloudflare Pages API token', previousSecret);
    } catch {
      deletePublishDeviceSecret(SECRET_FILE);
    }
    throw error;
  }
  return loadFoliolePublishSettings();
}

export function saveFoliolePublishSiteAddress(siteAddress: string) {
  const current = stored();
  if (!current) throw new Error('Connect Foliole Publish before changing its public address.');
  const updatedAt = new Date().toISOString();
  const value = {
    ...current,
    site_address: normalizeSiteAddress(siteAddress) || current.pages_url,
    updated_at: updatedAt
  };
  saveJsonSetting(SETTINGS_KEY, value, updatedAt);
  return loadFoliolePublishSettings();
}

export function clearFoliolePublishSettings() {
  deletePublishDeviceSecret(SECRET_FILE);
  const updatedAt = new Date().toISOString();
  saveJsonSetting(SETTINGS_KEY, null, updatedAt);
  return empty();
}

export function loadStoredFoliolePublishSettings() { return stored(); }
