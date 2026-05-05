import type { KeepImportItemStatus } from '../../lib/core/database/keepImportItems.js';
import type { KeepImportItemRow } from '../database/keepImportItems.js';
import { readKeepImportItem, upsertKeepImportItem } from '../database/keepImportItems.js';
import type { DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

import { resolveKeepImportSourceSignature } from './keepImportPreparedRecord.js';
import type { KeepImportRuleConfig } from './keepImportService.js';
import type { KeepImportSourceSignature } from './keepImportSourceSignature.js';

const SOURCE_UPDATE_DETAIL = 'Source update was detected.';

function buildUpdateImportId(config: KeepImportRuleConfig, sourcePath: string) {
  return `keep-update-${config.ruleId}-${sourcePath}`;
}

function resolvePersistedStatus(existingItem: KeepImportItemRow): KeepImportItemStatus {
  return existingItem.last_status === 'blocked_deleted' ? 'blocked_deleted' : existingItem.last_status;
}

function persistSourceUpdateState(
  config: KeepImportRuleConfig,
  existingItem: KeepImportItemRow,
  sourcePath: string,
  importedAt: string,
  sourceSignature: KeepImportSourceSignature
) {
  upsertKeepImportItem({
    firstSeenAt: existingItem.first_seen_at,
    hasSourceUpdate: true,
    highlightSourceMtimeMs: sourceSignature.highlight?.mtimeMs ?? null,
    highlightSourceSizeBytes: sourceSignature.highlight?.sizeBytes ?? null,
    lastImportedAt: existingItem.last_imported_at,
    lastNodeId: existingItem.last_node_id,
    lastSeenAt: importedAt,
    lastStatus: resolvePersistedStatus(existingItem),
    ruleId: config.ruleId,
    sourceMtimeMs: sourceSignature.primary.mtimeMs,
    sourcePath,
    sourceSizeBytes: sourceSignature.primary.sizeBytes
  });
}

export async function persistDetectedSourceUpdate(config: KeepImportRuleConfig, source: DirectoryImportSourceDescriptor) {
  const importedAt = new Date().toISOString();
  const existingItem = readKeepImportItem(config.ruleId, source.sourceName);
  if (existingItem) {
    const sourceSignature = await resolveKeepImportSourceSignature(config, source);
    persistSourceUpdateState(config, existingItem, source.sourceName, importedAt, sourceSignature);
  }
  return {
    detail: SOURCE_UPDATE_DETAIL,
    failureReason: null,
    importId: buildUpdateImportId(config, source.sourceName),
    importStatus: null
  };
}
