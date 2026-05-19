import path from 'node:path';

import type { NativeRemovedSourcesResult } from '../../lib/platform/nativeRemovedSourcesContract.js';
import { readKeepImportItemCache } from '../database/keepImportItemCache.js';
import { listRemovedKeepImportItems } from '../database/keepImportItems.js';
import { refreshKeepImportItemCache } from '../import/keepImportItemCacheRefresh.js';
import { buildKeepImportSourceDescriptor, resolveKeepImportRuleConfig } from '../import/keepImportManualSource.js';

interface SourceDocument {
  content: string | null;
  contentPreview: string | null;
  title: string;
}

function fallbackTitleFromSourcePath(sourcePath: string) {
  const fallbackTitle = path.basename(sourcePath).replace(/\.(md|markdown|html|txt)$/i, '').trim() || path.basename(sourcePath);
  return fallbackTitle;
}

function cacheToSourceDocument(cache: NonNullable<ReturnType<typeof readKeepImportItemCache>>): SourceDocument {
  return {
    content: cache.content,
    contentPreview: cache.content_preview,
    title: cache.title
  };
}

async function refreshReadwiseSourceDocumentCache(ruleId: string, sourcePath: string) {
  const config = resolveKeepImportRuleConfig(ruleId);
  if (config?.sourceType !== 'readwise') {
    return;
  }
  try {
    const source = await buildKeepImportSourceDescriptor(config, sourcePath);
    await refreshKeepImportItemCache(config, source, new Date().toISOString(), { force: true });
  } catch {
    // Removed remains readable from its last cache even if the source file is currently unavailable.
  }
}

async function loadSourceDocument(ruleId: string, sourcePath: string) {
  await refreshReadwiseSourceDocumentCache(ruleId, sourcePath);
  const cache = readKeepImportItemCache(ruleId, sourcePath);
  if (cache) {
    return cacheToSourceDocument(cache);
  }
  return { content: null, contentPreview: null, title: fallbackTitleFromSourcePath(sourcePath) };
}

export async function loadRemovedSources(): Promise<NativeRemovedSourcesResult> {
  const entries = await Promise.all(
    listRemovedKeepImportItems().map(async (entry) => {
      const source = await loadSourceDocument(entry.rule_id, entry.source_path);
      return {
        content: source.content,
        content_preview: source.contentPreview,
        deleted_at: String(entry.deleted_at ?? entry.first_seen_at),
        first_seen_at: entry.first_seen_at,
        has_source_update: entry.has_source_update === 1,
        last_imported_at: entry.last_imported_at,
        last_node_id: entry.last_node_id,
        last_seen_at: entry.last_seen_at,
        rule_id: entry.rule_id,
        source_path: entry.source_path,
        source_state: 'present' as const,
        title: source.title
      };
    })
  );
  return {
    entries,
    loaded_at: new Date().toISOString()
  };
}
