import fs from 'node:fs';
import path from 'node:path';

import { app, safeStorage } from 'electron';

import type {
  NativeDiscoursePublishCatalog,
  NativeDiscoursePublishSettings,
  NativeDiscoursePublishSettingsInput
} from '../../lib/platform/nativeDiscoursePublishContract.js';
import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';

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

function resolveSecretPath() {
  return path.join(app.getPath('userData'), SECRET_FILE);
}

function ensureEncryptionAvailable() {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Electron safeStorage is unavailable for Discourse API keys.');
  }
}

export function loadDiscourseApiKey() {
  const secretPath = resolveSecretPath();
  if (!fs.existsSync(secretPath)) return '';
  ensureEncryptionAvailable();
  return safeStorage.decryptString(fs.readFileSync(secretPath));
}

function saveDiscourseApiKey(apiKey: string) {
  ensureEncryptionAvailable();
  fs.mkdirSync(path.dirname(resolveSecretPath()), { recursive: true });
  fs.writeFileSync(resolveSecretPath(), safeStorage.encryptString(apiKey));
}

export function loadDiscoursePublishSettings(): NativeDiscoursePublishSettings {
  const settings = loadStoredSettings();
  if (!settings) return emptySettings();
  return {
    ...settings,
    has_api_key: fs.existsSync(resolveSecretPath())
  };
}

export function saveDiscoursePublishSettings(input: NativeDiscoursePublishSettingsInput) {
  const updatedAt = new Date().toISOString();
  const current = loadStoredSettings();
  const settings: StoredDiscoursePublishSettings = {
    site_url: normalizeSiteUrl(input.site_url),
    updated_at: updatedAt
  };
  if (current?.catalog_cache) settings.catalog_cache = current.catalog_cache;
  if (current?.recent_by_site) settings.recent_by_site = current.recent_by_site;
  saveStoredSettings(settings);
  if (typeof input.api_key === 'string' && input.api_key.length > 0) {
    saveDiscourseApiKey(input.api_key);
  }
  return loadDiscoursePublishSettings();
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
