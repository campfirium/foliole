import {
  markMissingKeepImportItems,
  readKeepImportItem,
  readKeepImportNodeState,
  upsertKeepImportItem
} from '../database/keepImportItems.js';
import type { DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

import { refreshKeepImportItemCache } from './keepImportItemCacheRefresh.js';
import { resolveKeepImportSourceSignature } from './keepImportPreparedRecord.js';
import { resolveReadwiseKeepImportDestination } from './keepImportReadwiseDestination.js';
import type { KeepImportRuleConfig } from './keepImportService.js';
import {
  hasHighlightSourceChanged,
  hasPrimarySourceChanged,
  type KeepImportSourceSignature
} from './keepImportSourceSignature.js';

function resolveLocalNodeState(existingItem: ReturnType<typeof readKeepImportItem>) {
  if (!existingItem?.last_node_id) {
    return existingItem?.local_node_state ?? 'not_imported';
  }
  const nodeState = readKeepImportNodeState(existingItem.last_node_id);
  if (!nodeState || nodeState.deleted_at !== null) {
    return 'locally_deleted';
  }
  return 'active';
}

function resolveCatalogSignature(input: {
  changed: boolean;
  existingItem: ReturnType<typeof readKeepImportItem>;
  sourceSignature: KeepImportSourceSignature;
}) {
  if (!input.existingItem || !input.changed) {
    return input.sourceSignature;
  }
  return {
    highlight: input.existingItem.highlight_source_mtime_ms === null || input.existingItem.highlight_source_size_bytes === null
      ? null
      : {
          mtimeMs: input.existingItem.highlight_source_mtime_ms,
          sizeBytes: input.existingItem.highlight_source_size_bytes
        },
    primary: {
      mtimeMs: input.existingItem.source_mtime_ms,
      sizeBytes: input.existingItem.source_size_bytes
    }
  };
}

export async function reconcileKeepImportCatalog(config: KeepImportRuleConfig, sources: DirectoryImportSourceDescriptor[]) {
  const seenAt = new Date().toISOString();
  const sourcePaths = sources.map((source) => source.sourceName);
  for (const source of sources) {
    const existingItem = readKeepImportItem(config.ruleId, source.sourceName);
    const sourceSignature = await resolveKeepImportSourceSignature(config, source);
    const destination = config.sourceType === 'readwise'
      ? await resolveReadwiseKeepImportDestination(config, source)
      : 'inbox';
    if (destination !== 'off') {
      await refreshKeepImportItemCache(config, source, seenAt);
    }
    const localNodeState = resolveLocalNodeState(existingItem);
    const primaryChanged = hasPrimarySourceChanged(existingItem, sourceSignature);
    const highlightChanged = config.sourceType === 'readwise' && hasHighlightSourceChanged(existingItem, sourceSignature);
    const changed = primaryChanged || highlightChanged;
    const catalogSignature = resolveCatalogSignature({ changed, existingItem, sourceSignature });
    upsertKeepImportItem({
      ...(existingItem?.first_seen_at ? { firstSeenAt: existingItem.first_seen_at } : {}),
      hasSourceUpdate: Boolean(existingItem?.has_source_update) || (Boolean(existingItem) && primaryChanged),
      highlightSourceMtimeMs: catalogSignature.highlight?.mtimeMs ?? null,
      highlightSourceSizeBytes: catalogSignature.highlight?.sizeBytes ?? null,
      lastImportedAt: existingItem?.last_imported_at ?? null,
      lastNodeId: existingItem?.last_node_id ?? null,
      lastSeenAt: seenAt,
      lastStatus: localNodeState === 'locally_deleted'
        ? 'blocked_deleted'
        : existingItem?.last_status ?? 'discovered',
      localNodeState,
      ruleId: config.ruleId,
      sourceMtimeMs: catalogSignature.primary.mtimeMs,
      sourcePath: source.sourceName,
      sourceSizeBytes: catalogSignature.primary.sizeBytes,
      sourceState: 'present'
    });
  }
  markMissingKeepImportItems(config.ruleId, sourcePaths);
}
