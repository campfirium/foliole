import type {
  NativeDiscoursePublishCatalog,
  NativeDiscoursePublishDraft,
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
  drafts_by_node?: Record<string, StoredPublishDraft>;
  recent_by_site?: Record<string, StoredRecentUsage>;
  site_url: string;
  updated_at: string;
}

interface StoredPublishDraft extends NativeDiscoursePublishDraft {
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
  last_published_tags?: string[];
  tags: string[];
}

const MAX_RECENT_CATEGORIES = 20;
const MAX_RECENT_TAGS = 50;
const MAX_PUBLISH_DRAFTS = 100;

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

function readStoredDraft(value: unknown): StoredPublishDraft | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const draft = value as Partial<StoredPublishDraft>;
  const categoryValid = draft.category_id === null || (Number.isInteger(draft.category_id) && Number(draft.category_id) > 0);
  const tagsValid = Array.isArray(draft.tags) && draft.tags.every((tag) => typeof tag === 'string');
  return categoryValid && tagsValid && typeof draft.updated_at === 'string' ? draft as StoredPublishDraft : null;
}

function normalizeDraft(draft: NativeDiscoursePublishDraft, updatedAt: string): StoredPublishDraft {
  return {
    category_id: Number.isInteger(draft.category_id) && Number(draft.category_id) > 0 ? draft.category_id : null,
    tags: [...new Set(draft.tags.map((tag) => tag.trim()).filter(Boolean))],
    updated_at: updatedAt
  };
}

function limitDrafts(drafts: Record<string, StoredPublishDraft>) {
  return Object.fromEntries(Object.entries(drafts)
    .sort(([, left], [, right]) => right.updated_at.localeCompare(left.updated_at))
    .slice(0, MAX_PUBLISH_DRAFTS));
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
  if (!siteChanged && current?.drafts_by_node) settings.drafts_by_node = current.drafts_by_node;
  if (!siteChanged && current?.recent_by_site) settings.recent_by_site = current.recent_by_site;
  saveStoredSettings(settings);
  if (typeof input.api_key === 'string' && input.api_key.length > 0) {
    saveDiscourseApiKey(input.api_key.trim());
  }
  return loadDiscoursePublishSettings();
}

export function loadDiscoursePublishDraft(nodeId: string): NativeDiscoursePublishDraft | null {
  const stored = loadStoredSettings();
  const draft = readStoredDraft(stored?.drafts_by_node?.[nodeId.trim()]);
  return draft ? { category_id: draft.category_id, tags: [...draft.tags] } : null;
}

export function saveDiscoursePublishDraft(args: {
  draft: NativeDiscoursePublishDraft | null;
  node_id: string;
}): NativeDiscoursePublishDraft | null {
  const current = loadStoredSettings();
  const nodeId = args.node_id.trim();
  if (!current || !current.site_url || !nodeId) return null;
  const updatedAt = new Date().toISOString();
  const drafts = { ...current.drafts_by_node };
  if (args.draft) drafts[nodeId] = normalizeDraft(args.draft, updatedAt);
  else delete drafts[nodeId];
  const next: StoredDiscoursePublishSettings = { ...current, updated_at: updatedAt };
  if (Object.keys(drafts).length > 0) next.drafts_by_node = limitDrafts(drafts);
  else delete next.drafts_by_node;
  saveStoredSettings(next);
  return loadDiscoursePublishDraft(nodeId);
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
    last_published_tags: recent?.last_published_tags ?? [],
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
  const publishedTags = [...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))];
  const category_ids = input.categoryId
    ? [input.categoryId, ...previous.category_ids.filter((id) => id !== input.categoryId)].slice(0, MAX_RECENT_CATEGORIES)
    : previous.category_ids;
  const tags = [
    ...publishedTags,
    ...previous.tags.filter((tag) => !publishedTags.includes(tag))
  ].slice(0, MAX_RECENT_TAGS);
  saveStoredSettings({
    ...current,
    recent_by_site: {
      ...current.recent_by_site,
      [siteUrl]: { category_ids, last_published_tags: publishedTags, tags }
    },
    updated_at: now
  });
}
