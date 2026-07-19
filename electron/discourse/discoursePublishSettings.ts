import type {
  NativeDiscoursePublishCatalog,
  NativeDiscoursePublishSettings,
  NativeDiscoursePublishSettingsInput
} from '../../lib/platform/nativeDiscoursePublishContract.js';
import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';
import {
  deletePublishDeviceSecret,
  hasPublishDeviceSecret,
  readPublishDeviceSecret,
  writePublishDeviceSecret
} from '../security/publishDeviceSecretStore.js';

const SETTINGS_KEY = 'discourse_publish_settings';
const SECRET_FILE = 'discourse-publish-secret.bin';

interface StoredDiscoursePublishSettings {
  catalog_cache?: StoredCatalogCache;
  recent_by_site?: Record<string, StoredRecentUsage>;
  site_url: string;
  updated_at: string;
}

interface StoredCatalogCache {
  categories: NativeDiscoursePublishCatalog['categories'];
  fetched_at: string;
  site_url: string;
  tags: NativeDiscoursePublishCatalog['tags'];
}

interface StoredRecentUsage {
  category_ids: number[];
  tags: string[];
}

const MAX_RECENT_CATEGORIES = 20;
const MAX_RECENT_TAGS = 50;

function normalizeSiteUrl(value: string) {
  return value.trim().replace(/\/+$/g, '');
}

function emptySettings(): NativeDiscoursePublishSettings {
  return {
    has_api_key: false,
    site_url: '',
    updated_at: null
  };
}

function isStoredSettings(value: unknown): value is StoredDiscoursePublishSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.site_url === 'string' &&
    typeof record.updated_at === 'string'
  );
}

function loadStoredSettings(): StoredDiscoursePublishSettings | null {
  const stored = loadJsonSetting(SETTINGS_KEY);
  return isStoredSettings(stored) ? stored : null;
}

function saveStoredSettings(settings: StoredDiscoursePublishSettings) {
  saveJsonSetting(SETTINGS_KEY, settings, settings.updated_at);
}

export function loadDiscourseApiKey() {
  return readPublishDeviceSecret(SECRET_FILE, 'Discourse API keys');
}

function saveDiscourseApiKey(apiKey: string) {
  writePublishDeviceSecret(SECRET_FILE, 'Discourse API keys', apiKey);
}

export function loadDiscoursePublishSettings(): NativeDiscoursePublishSettings {
  const settings = loadStoredSettings();
  if (!settings) return emptySettings();
  return {
    ...settings,
    has_api_key: hasPublishDeviceSecret(SECRET_FILE)
  };
}

export function saveDiscoursePublishSettings(input: NativeDiscoursePublishSettingsInput) {
  const updatedAt = new Date().toISOString();
  const current = loadStoredSettings();
  const siteUrl = normalizeSiteUrl(input.site_url);
  const siteChanged = Boolean(current && current.site_url !== siteUrl);
  if (siteChanged || !siteUrl) deletePublishDeviceSecret(SECRET_FILE);
  const settings: StoredDiscoursePublishSettings = {
    site_url: siteUrl,
    updated_at: updatedAt
  };
  if (!siteChanged && current?.catalog_cache) settings.catalog_cache = current.catalog_cache;
  if (!siteChanged && current?.recent_by_site) settings.recent_by_site = current.recent_by_site;
  saveStoredSettings(settings);
  if (typeof input.api_key === 'string' && input.api_key.length > 0) {
    saveDiscourseApiKey(input.api_key.trim());
  }
  return loadDiscoursePublishSettings();
}

export function disconnectDiscoursePublishSettings() {
  deletePublishDeviceSecret(SECRET_FILE);
  return saveDiscoursePublishSettings({ site_url: '' });
}

export function loadDiscourseCatalogCache(siteUrl: string): NativeDiscoursePublishCatalog | null {
  const settings = loadStoredSettings();
  const cache = settings?.catalog_cache;
  if (!cache || cache.site_url !== siteUrl) return null;
  const recent = settings?.recent_by_site?.[siteUrl];
  return {
    categories: cache.categories,
    fetched_at: cache.fetched_at,
    from_cache: true,
    recent_category_ids: recent?.category_ids ?? [],
    recent_tags: recent?.tags ?? [],
    tags: cache.tags
  };
}

export function saveDiscourseCatalogCache(siteUrl: string, catalog: Pick<NativeDiscoursePublishCatalog, 'categories' | 'tags'>) {
  const now = new Date().toISOString();
  const current = loadStoredSettings();
  if (!current) return;
  saveStoredSettings({
    ...current,
    catalog_cache: {
      categories: catalog.categories,
      fetched_at: now,
      site_url: siteUrl,
      tags: catalog.tags
    },
    updated_at: now
  });
}

export function recordDiscoursePublishUsage(siteUrl: string, input: { categoryId: number | null; tags: string[] }) {
  const now = new Date().toISOString();
  const current = loadStoredSettings();
  if (!current) return;
  const previous = current.recent_by_site?.[siteUrl] ?? { category_ids: [], tags: [] };
  const category_ids = input.categoryId
    ? [input.categoryId, ...previous.category_ids.filter((id) => id !== input.categoryId)].slice(0, MAX_RECENT_CATEGORIES)
    : previous.category_ids;
  const tags = [
    ...input.tags,
    ...previous.tags.filter((tag) => !input.tags.includes(tag))
  ].slice(0, MAX_RECENT_TAGS);
  saveStoredSettings({
    ...current,
    recent_by_site: {
      ...current.recent_by_site,
      [siteUrl]: { category_ids, tags }
    },
    updated_at: now
  });
}
