import { isReadwiseObjectCreatedAfter } from '../../lib/core/readwise/readwiseSourceCutover.js';
import type { NativeReadwiseManualSource, NativeReadwiseManualSearchResult } from '../../lib/platform/nativeReadwiseManualImportContract.js';
import { registerDatabaseConnectionCleanup, resolveDatabasePath } from '../database/connection.js';
import { loadActiveImportedSourceLocatorNodeIds, resolveImportedNodeIdForExternalDocument } from '../database/externalDocumentImportVisibility.js';
import { readKeepImportItem, readKeepImportNodeState } from '../database/keepImportItems.js';
import { loadReadwiseApiImportSource } from '../database/readwiseApiImportState.js';
import { canCurrentHostRunReadwise } from '../database/readwiseHostAssignment.js';
import { loadReadwiseRemoteSource } from '../database/readwiseRemoteIdentity.js';
import { loadReadwiseSourceCutover } from '../database/readwiseSourceCutover.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import { loadStoredReadwiseHostSettings } from './readwiseApiConnectionState.js';
import type { ReadwiseApiFetchDependencies } from './readwiseApiImportFetch.js';
import { loadApiSearchMetadata, loadFolderSearchMetadata, type ReadwiseSearchMetadata } from './readwiseManualSearchMetadata.js';

interface SearchCache {
  key: string;
  expiresAt: number;
  sources: ReadwiseSearchMetadata[] | null;
  promise: Promise<NativeReadwiseManualSearchResult>;
}
let cache: SearchCache | null = null;
registerDatabaseConnectionCleanup(() => { cache = null; });

export function normalizeReadwiseSearchQuery(query: string) {
  return query.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function readwiseSearchContext() {
  const settings = loadImportManagerSettings();
  const mode = settings.readwiseSourceMode;
  if (mode === 'off' || !canCurrentHostRunReadwise(mode)) throw new Error('readwise_search_unavailable');
  if (loadReadwiseSourceCutover()?.status === 'migration-in-progress') throw new Error('readwise_search_unavailable');
  const connectionRef = mode === 'api' ? loadReadwiseRemoteSource()?.connectionRef ?? null : null;
  if (mode === 'api' && !connectionRef) throw new Error('readwise_search_unavailable');
  const key = JSON.stringify([resolveDatabasePath(), mode, connectionRef,
    mode === 'api' ? loadStoredReadwiseHostSettings().apiConnection : settings.readwiseSources]);
  return { key, mode, connectionRef };
}

export function prepareReadwiseManualSearch(dependencies: ReadwiseApiFetchDependencies = {}) {
  const context = readwiseSearchContext();
  if (cache?.key === context.key && (!cache.sources || cache.expiresAt > Date.now())) return cache.promise;
  const next: SearchCache = { key: context.key, expiresAt: 0, sources: null, promise: Promise.resolve({ status: 'preparing', sources: [] }) };
  cache = next;
  next.promise = (context.mode === 'api' ? loadApiSearchMetadata(dependencies) : loadFolderSearchMetadata())
    .then((sources): NativeReadwiseManualSearchResult => {
      if (cache !== next || readwiseSearchContext().key !== next.key) throw new Error('readwise_search_expired');
      next.sources = sources;
      next.expiresAt = Date.now() + 5 * 60_000;
      return { status: 'ready', sources: [] };
    }).catch((error: unknown) => {
      if (cache === next) cache = null;
      throw error;
    });
  return next.promise;
}

export function searchReadwiseManualSources(query: string): NativeReadwiseManualSearchResult {
  const context = readwiseSearchContext();
  if (!cache?.sources || cache.key !== context.key || cache.expiresAt <= Date.now()) {
    return { status: 'preparing', sources: [] };
  }
  const normalized = normalizeReadwiseSearchQuery(query);
  if (!normalized) return { status: 'ready', sources: [] };
  const imported = context.mode === 'folder' ? loadActiveImportedSourceLocatorNodeIds() : new Map<string, string>();
  const sources = cache.sources.filter((source) =>
    normalizeReadwiseSearchQuery(`${source.title} ${source.author ?? ''}`).includes(normalized)
  ).map((source) => presentReadwiseManualSource(source, imported));
  return { status: 'ready', sources };
}

export function requireReadwiseManualSource(id: string) {
  const context = readwiseSearchContext();
  if (!cache?.sources || cache.key !== context.key || cache.expiresAt <= Date.now()) throw new Error('readwise_search_expired');
  const source = cache.sources.find((item) => item.id === id);
  if (!source) throw new Error('readwise_search_source_missing');
  return { context, source };
}

export function presentReadwiseManualSource(source: ReadwiseSearchMetadata, imported?: Map<string, string>): NativeReadwiseManualSource {
  return { id: source.id, author: source.author, title: source.title, kind: source.kind, status: resolveStatus(source, imported) };
}

function resolveStatus(source: ReadwiseSearchMetadata, imported?: Map<string, string>): NativeReadwiseManualSource['status'] {
  if (source.remoteId) {
    const connectionRef = readwiseSearchContext().connectionRef!;
    const existing = loadReadwiseApiImportSource(connectionRef, source.remoteId);
    const cutover = loadReadwiseSourceCutover();
    if (cutover?.version === 2) {
      const classified = cutover.documents.find((item) => item.remoteId === source.remoteId);
      if (classified?.status === 'suppressed' || (existing?.nodeId && cutover.retiredNodeIds.includes(existing.nodeId))) return 'suppressed';
      if (!existing && !classified && !isReadwiseObjectCreatedAfter(source.createdAt, cutover.startedAt)) return 'suppressed';
    }
    return existing?.nodeDeleted ? 'deleted' : existing?.nodeId ? 'imported' : 'available';
  }
  const item = readKeepImportItem(source.ruleId!, source.sourcePath!);
  const nodeId = item?.last_node_id ?? (source.filePath ? resolveImportedNodeIdForExternalDocument(source.filePath, imported) : null) ?? source.nodeId;
  const node = nodeId ? readKeepImportNodeState(nodeId) : null;
  if (item?.local_node_state === 'locally_deleted' || (nodeId && (!node || node.deleted_at))) return 'deleted';
  return node ? 'imported' : 'available';
}
