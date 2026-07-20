import {
  FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY,
  normalizeFullTextSearchIndexStrategy,
  type FullTextSearchIndexStrategy
} from '../../../lib/core/database/fullTextSearchIndexStrategy';

import { searchCompanionExternalDocuments } from './companionExternalDocuments';
import { searchCompanionPdfPageText } from './companionSyncObjects';
import {
  FolioleCompanionSync,
  isAvailableNativeAndroidCompanionRuntime,
  isNativeAndroidCompanionRuntime,
  isNativeCompanionPdfPageTextRuntime,
  isNativeCompanionTopicSearchRuntime
} from './companionWorkspaceRuntimeRepository';

const APP_SETTINGS_KEY = 'app_settings';

export interface CompanionTopicSearchResult {
  bodyStatus: 'empty' | 'failed' | 'fetching' | 'missing' | 'ready';
  excerpt: string;
  matchStart: number;
  nodeId: string;
  openingText: string | null;
  title: string;
  updatedAt: string;
}

export interface CompanionFullTextSearchResults {
  external: Awaited<ReturnType<typeof searchCompanionExternalDocuments>>;
  pdf: Awaited<ReturnType<typeof searchCompanionPdfPageText>>;
  strategy: FullTextSearchIndexStrategy;
  topics: CompanionTopicSearchResult[];
}

interface SyncSettingPayload {
  key?: string;
  value_json?: string;
}

interface NativeTopicSearchResult {
  content_status?: CompanionTopicSearchResult['bodyStatus'];
  excerpt: string;
  match_start: number;
  node_id: string;
  opening_text: string | null;
  title: string;
  updated_at: string;
}

export async function searchCompanionFullText(query: string, limit?: number): Promise<CompanionFullTextSearchResults> {
  const normalizedQuery = query.trim();
  const strategy = await loadCompanionFullTextSearchStrategyOrDefault();
  if (!normalizedQuery || !isNativeCompanionTopicSearchRuntime()) {
    return { external: [], pdf: [], strategy, topics: [] };
  }

  if (!isAvailableNativeAndroidCompanionRuntime()) {
    const [topics, pdf] = await Promise.all([
      searchCompanionTopics(normalizedQuery, limit),
      searchCompanionPdfPageText(normalizedQuery, limit)
    ]);
    return {
      external: [],
      pdf,
      strategy,
      topics
    };
  }

  const [topics, pdf, external] = await Promise.all([
    searchCompanionTopics(normalizedQuery, limit),
    searchCompanionPdfPageText(normalizedQuery, limit),
    searchCompanionExternalDocuments(normalizedQuery, limit)
  ]);
  return { external, pdf, strategy, topics };
}

export function supportsCompanionExtendedSearch() {
  return isNativeCompanionPdfPageTextRuntime();
}

async function loadCompanionFullTextSearchStrategyOrDefault() {
  try {
    return await loadCompanionFullTextSearchStrategy();
  } catch {
    return normalizeFullTextSearchIndexStrategy(null);
  }
}

export async function loadCompanionFullTextSearchStrategy() {
  if (!isNativeAndroidCompanionRuntime()) {
    return normalizeFullTextSearchIndexStrategy(null);
  }
  const index = await FolioleCompanionSync.loadSyncIndex();
  const settingObjectIds = index.entries
    .filter((entry) => entry.object_type === 'setting' && entry.object_id.endsWith(`:${APP_SETTINGS_KEY}`))
    .map((entry) => entry.object_id);
  if (settingObjectIds.length === 0) return normalizeFullTextSearchIndexStrategy(null);
  const objects = await FolioleCompanionSync.loadSyncObjects({
    object_ids: settingObjectIds,
    object_types: ['setting']
  });
  const settings = objects.objects
    .map((object) => parseSettingPayload(object.payload_json))
    .filter((payload): payload is SyncSettingPayload => Boolean(payload?.key === APP_SETTINGS_KEY && payload.value_json))
    .at(-1);
  return normalizeFullTextSearchIndexStrategy(parseAppSettings(settings?.value_json)?.[FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY]);
}

async function searchCompanionTopics(query: string, limit?: number) {
  const results = (await FolioleCompanionSync.searchTopics({ ...(limit !== undefined ? { limit } : {}), query })).results as NativeTopicSearchResult[];
  return results.map((result) => ({
    bodyStatus: normalizeBodyStatus(result.content_status),
    excerpt: result.excerpt,
    matchStart: result.match_start,
    nodeId: result.node_id,
    openingText: result.opening_text,
    title: result.title,
    updatedAt: result.updated_at
  }));
}

function normalizeBodyStatus(status: NativeTopicSearchResult['content_status']): CompanionTopicSearchResult['bodyStatus'] {
  return status === 'empty' || status === 'failed' || status === 'fetching' || status === 'missing' ? status : 'ready';
}

function parseSettingPayload(payloadJson: string | null): SyncSettingPayload | null {
  if (!payloadJson) return null;
  try {
    return JSON.parse(payloadJson) as SyncSettingPayload;
  } catch {
    return null;
  }
}

function parseAppSettings(valueJson: string | undefined): Record<string, unknown> | null {
  if (!valueJson) return null;
  try {
    return JSON.parse(valueJson) as Record<string, unknown>;
  } catch {
    return null;
  }
}
