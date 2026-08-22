import { normalizeCloudflareProjectName } from '../../lib/core/foliolePublish/cloudflarePagesProjectName.js';
import type { NativeFoliolePublishConnectInput, NativeFoliolePublishDraftInput, NativeFoliolePublishField, NativeFoliolePublishFieldCatalogEntry, NativeFoliolePublishSettings } from '../../lib/platform/nativeFoliolePublishContract.js';
import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';
import { deletePublishDeviceSecret, hasPublishDeviceSecret, readPublishDeviceSecret, writePublishDeviceSecret } from '../security/publishDeviceSecretStore.js';

import { normalizeSiteAddress } from './cloudflarePagesClient.js';

const SETTINGS_KEY = 'foliole_publish_settings';
const SECRET_FILE = 'foliole-publish-cloudflare-token.bin';

interface StoredSettings {
  account_id: string;
  pages_url: string;
  project_name: string;
  site_address: string;
  updated_at: string;
  field_catalog?: NativeFoliolePublishFieldCatalogEntry[];
}

function empty(): NativeFoliolePublishSettings {
  return { account_id: '', credentials_valid: false, field_catalog: [], has_credentials: false, pages_url: '', project_name: '', site_address: '', updated_at: null };
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
  const hasCredentials = hasPublishDeviceSecret(SECRET_FILE);
  return value ? {
    ...value,
    credentials_valid: hasCredentials,
    field_catalog: normalizeCatalog(value.field_catalog),
    has_credentials: hasCredentials
  } : empty();
}

function deployed(value: StoredSettings | null) {
  return value && value.pages_url && value.site_address ? value : null;
}

function restoreToken(previous: string | null) {
  if (previous === null) deletePublishDeviceSecret(SECRET_FILE);
  else writePublishDeviceSecret(SECRET_FILE, 'Cloudflare Pages API token', previous);
}

export function saveFoliolePublishDraft(input: NativeFoliolePublishDraftInput) {
  const current = stored();
  if (deployed(current)) return loadFoliolePublishSettings();
  const updatedAt = new Date().toISOString();
  const previousSecret = loadFoliolePublishToken() || null;
  const value: StoredSettings = {
    account_id: input.account_id.trim(), field_catalog: [], pages_url: '',
    project_name: input.project_name.trim(), site_address: '', updated_at: updatedAt
  };
  try {
    if (input.api_token.trim()) {
      writePublishDeviceSecret(SECRET_FILE, 'Cloudflare Pages API token', input.api_token.trim());
    }
    saveJsonSetting(SETTINGS_KEY, value, updatedAt);
  } catch (error) {
    try { restoreToken(previousSecret); } catch { deletePublishDeviceSecret(SECRET_FILE); }
    throw error;
  }
  return loadFoliolePublishSettings();
}

function normalizeCatalog(value: unknown): NativeFoliolePublishFieldCatalogEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const entry = item as Partial<NativeFoliolePublishFieldCatalogEntry>;
    if (typeof entry.key !== 'string' || typeof entry.multiple !== 'boolean' || !Array.isArray(entry.recent_values)) return [];
    return [{ key: entry.key, multiple: entry.multiple, recent_values: entry.recent_values.slice(0, 9) as NativeFoliolePublishFieldCatalogEntry['recent_values'] }];
  }).slice(0, 80);
}

function saveCatalog(catalog: NativeFoliolePublishFieldCatalogEntry[]) {
  const current = stored();
  if (!current) return empty();
  const updatedAt = new Date().toISOString();
  saveJsonSetting(SETTINGS_KEY, { ...current, field_catalog: catalog, updated_at: updatedAt }, updatedAt);
  return loadFoliolePublishSettings();
}

export function recordFoliolePublishFields(fields: NativeFoliolePublishField[]) {
  const catalog = normalizeCatalog(stored()?.field_catalog);
  for (const field of fields) {
    const multiple = Array.isArray(field.value);
    const previous = catalog.find((entry) => entry.key === field.key);
    const recent = field.value.length === 0 ? [] : [field.value];
    const entry = { key: field.key, multiple, recent_values: [...recent, ...(previous?.recent_values ?? [])].slice(0, 9) };
    const index = catalog.findIndex((item) => item.key === field.key);
    if (index >= 0) catalog.splice(index, 1);
    catalog.unshift(entry);
  }
  return saveCatalog(catalog.slice(0, 80));
}

export function forgetFoliolePublishField(key: string) {
  return saveCatalog(normalizeCatalog(stored()?.field_catalog).filter((entry) => entry.key !== key));
}

export function resetFoliolePublishFieldHistory() { return saveCatalog([]); }

export function saveFoliolePublishConnection(input: NativeFoliolePublishConnectInput, pagesUrl: string) {
  const updatedAt = new Date().toISOString();
  const previous = stored();
  const normalizedProject = normalizeCloudflareProjectName(input.project_name);
  const sameSite = previous?.account_id === input.account_id.trim() && previous.project_name === normalizedProject;
  const value: StoredSettings = {
    account_id: input.account_id.trim(), pages_url: normalizeSiteAddress(pagesUrl),
    project_name: normalizedProject,
    site_address: normalizeSiteAddress(input.site_address) || normalizeSiteAddress(pagesUrl), updated_at: updatedAt,
    field_catalog: sameSite ? normalizeCatalog(previous?.field_catalog) : []
  };
  if (!value.account_id || !input.api_token.trim()) throw new Error('Enter a Cloudflare Account ID and authorization result.');
  const previousSecret = loadFoliolePublishToken() || null;
  try {
    writePublishDeviceSecret(SECRET_FILE, 'Cloudflare Pages API token', input.api_token.trim());
    saveJsonSetting(SETTINGS_KEY, value, updatedAt);
  } catch (error) {
    try { restoreToken(previousSecret); } catch { deletePublishDeviceSecret(SECRET_FILE); }
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

export function loadStoredFoliolePublishSettings() { return deployed(stored()); }
