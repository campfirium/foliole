import {
  markMissingKeepImportItems,
  readKeepImportItem,
  readKeepImportNodeState,
  upsertKeepImportItem
} from '../database/keepImportItems.js';
import type { DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

import { refreshKeepImportItemCache } from './keepImportItemCacheRefresh.js';
import { resolveKeepImportSourceSignature } from './keepImportPreparedRecord.js';
import type { KeepImportRuleConfig } from './keepImportService.js';
import { hasHighlightSourceChanged, hasPrimarySourceChanged } from './keepImportSourceSignature.js';

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

export async function reconcileKeepImportCatalog(config: KeepImportRuleConfig, sources: DirectoryImportSourceDescriptor[]) {
  const seenAt = new Date().toISOString();
  const sourcePaths = sources.map((source) => source.sourceName);
  for (const source of sources) {
    const existingItem = readKeepImportItem(config.ruleId, source.sourceName);
    const sourceSignature = await resolveKeepImportSourceSignature(config, source);
    await refreshKeepImportItemCache(config, source, seenAt);
    const localNodeState = resolveLocalNodeState(existingItem);
    const changed =
      hasPrimarySourceChanged(existingItem, sourceSignature) ||
      (config.sourceType === 'readwise' && hasHighlightSourceChanged(existingItem, sourceSignature));
    upsertKeepImportItem({
      ...(existingItem?.first_seen_at ? { firstSeenAt: existingItem.first_seen_at } : {}),
      hasSourceUpdate: Boolean(existingItem?.has_source_update) || (Boolean(existingItem) && changed),
      highlightSourceMtimeMs: sourceSignature.highlight?.mtimeMs ?? null,
      highlightSourceSizeBytes: sourceSignature.highlight?.sizeBytes ?? null,
      lastImportedAt: existingItem?.last_imported_at ?? null,
      lastNodeId: existingItem?.last_node_id ?? null,
      lastSeenAt: seenAt,
      lastStatus: localNodeState === 'locally_deleted'
        ? 'blocked_deleted'
        : existingItem?.last_status ?? 'discovered',
      localNodeState,
      ruleId: config.ruleId,
      sourceMtimeMs: sourceSignature.primary.mtimeMs,
      sourcePath: source.sourceName,
      sourceSizeBytes: sourceSignature.primary.sizeBytes,
      sourceState: 'present'
    });
  }
  markMissingKeepImportItems(config.ruleId, sourcePaths);
}
