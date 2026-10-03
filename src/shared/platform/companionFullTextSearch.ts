import {
  FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY,
  normalizeFullTextSearchIndexStrategy,
  type FullTextSearchIndexStrategy
} from '../../../lib/core/database/fullTextSearchIndexStrategy';

import { loadCompanionSearchSnapshot } from './companion/runtime/companionSearchSnapshot';
import { loadCompanionWorkspaceNode } from './companion/runtime/companionWorkspaceNodeStore';
import { loadIosSyncIndex, loadIosSyncObjects, searchIosTopics } from './companion/runtime/iosCompanionActiveDatabaseReads';
import { normalizeExternalDocumentSearchResult, searchCompanionExternalDocuments } from './companionExternalDocuments';
import { searchCompanionPdfPageText } from './companionSyncObjects';
import {
  isNativeCompanionExternalDocumentSearchRuntime,
  isNativeCompanionSyncObjectReadRuntime,
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
  id?: string;
  match_start: number;
  node_id?: string;
  opening_text: string | null;
  title: string;
  updated_at: string;
}

export type CompanionSearchOffsets = { external?: number | null; pdf?: number | null; topics?: number | null };

export async function searchCompanionFullText(query: string, limit?: number, offsets: CompanionSearchOffsets = {}): Promise<CompanionFullTextSearchResults> {
  const normalizedQuery = query.trim();
  const strategy = await loadCompanionFullTextSearchStrategyOrDefault();
  if (!normalizedQuery || !isNativeCompanionTopicSearchRuntime()) {
    return { external: [], pdf: [], strategy, topics: [] };
  }

  const [topics, pdf, external] = await Promise.all([
    offsets.topics === null ? [] : searchCompanionTopics(normalizedQuery, limit, offsets.topics),
    offsets.pdf === null ? [] : searchCompanionPdfPageText(normalizedQuery, limit, offsets.pdf),
    offsets.external === null ? [] : searchCompanionExternalDocuments(normalizedQuery, limit, offsets.external)
  ]);
  return { external, pdf, strategy, topics };
}

export async function searchCompanionFullTextSnapshot(query: string): Promise<CompanionFullTextSearchResults> {
  const normalizedQuery = query.trim();
  const strategy = await loadCompanionFullTextSearchStrategyOrDefault();
  if (!normalizedQuery || !isNativeCompanionTopicSearchRuntime()) return { external: [], pdf: [], strategy, topics: [] };
  const snapshot = await loadCompanionSearchSnapshot(normalizedQuery);
  return {
    strategy,
    topics: (snapshot.topics as unknown as NativeTopicSearchResult[]).map(toCompanionTopicSearchResult),
    pdf: snapshot.pdf as unknown as CompanionFullTextSearchResults['pdf'],
    external: snapshot.external.map((row) => normalizeExternalDocumentSearchResult(
      row as unknown as Parameters<typeof normalizeExternalDocumentSearchResult>[0]
    ))
  };
}

export function supportsCompanionExtendedSearch() {
  return isNativeCompanionExternalDocumentSearchRuntime();
}

async function loadCompanionFullTextSearchStrategyOrDefault() {
  try {
    return await loadCompanionFullTextSearchStrategy();
  } catch {
    return normalizeFullTextSearchIndexStrategy(null);
  }
}

export async function loadCompanionFullTextSearchStrategy() {
  if (!isNativeCompanionSyncObjectReadRuntime()) {
    return normalizeFullTextSearchIndexStrategy(null);
  }
  const index = { entries: await loadIosSyncIndex() };
  const settingObjectIds = index.entries
    .filter((entry) => entry.object_type === 'setting' && entry.object_id.endsWith(`:${APP_SETTINGS_KEY}`))
    .map((entry) => entry.object_id);
  if (settingObjectIds.length === 0) return normalizeFullTextSearchIndexStrategy(null);
  const objects = { objects: await loadIosSyncObjects(settingObjectIds, ['setting']) };
  const settings = objects.objects
    .map((object) => parseSettingPayload(object.payload_json))
    .filter((payload): payload is SyncSettingPayload => Boolean(payload?.key === APP_SETTINGS_KEY && payload.value_json))
    .at(-1);
  return normalizeFullTextSearchIndexStrategy(parseAppSettings(settings?.value_json)?.[FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY]);
}

async function searchCompanionTopics(query: string, limit?: number, offset = 0) {
  const results = await searchIosTopics(query, limit, offset) as NativeTopicSearchResult[];
  return results.map(toCompanionTopicSearchResult);
}

function toCompanionTopicSearchResult(result: NativeTopicSearchResult): CompanionTopicSearchResult {
  const nodeId = result.node_id ?? result.id;
  if (!nodeId) throw new Error('companion_topic_search_identity_missing');
  return {
    bodyStatus: normalizeBodyStatus(result.content_status),
    excerpt: result.excerpt,
    matchStart: result.match_start,
    nodeId,
    openingText: result.opening_text,
    title: result.title,
    updatedAt: result.updated_at
  };
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


export async function isCompanionSearchTopicAvailable(nodeId: string) {
  if (!isNativeCompanionTopicSearchRuntime()) return false;
  const node = await loadCompanionWorkspaceNode(nodeId);
  return Boolean(node && !node.deletedAt);
}
