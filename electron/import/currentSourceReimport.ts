import type { NativeDevReimportCurrentTopicSourceResult } from '../../lib/platform/nativeImportContract.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadNodeSourceDetails } from '../database/nodeSourceDetails.js';

import { buildKeepImportSourceDescriptor, resolveKeepImportRuleConfig } from './keepImportManualSource.js';
import { runSingleKeepImportSource } from './keepImportRunSource.js';

function readLatestNodeId(ruleId: string, sourcePath: string) {
  return openDatabaseConnection().sqlite
    .prepare('SELECT last_node_id FROM keep_import_items WHERE rule_id = ? AND source_path = ?')
    .get(ruleId, sourcePath) as { last_node_id: string | null } | undefined;
}

export async function reimportCurrentTopicSource(nodeId: string): Promise<NativeDevReimportCurrentTopicSourceResult> {
  const reimportedAt = new Date().toISOString();
  const details = loadNodeSourceDetails(nodeId, 1);
  const item = details?.keepImportItem;
  if (!details || !item || item.local_node_state !== 'active') {
    return {
      detail: 'Selected topic is not backed by an active keep import source.',
      node_id: null,
      reimported_at: reimportedAt,
      status: 'unavailable'
    };
  }
  const config = resolveKeepImportRuleConfig(item.rule_id);
  if (!config) {
    return {
      detail: 'The watch folder for this source is no longer configured.',
      node_id: null,
      reimported_at: reimportedAt,
      status: 'failed'
    };
  }
  try {
    const source = await buildKeepImportSourceDescriptor(config, item.source_path);
    const result = await runSingleKeepImportSource(config, source, { forceTopicImport: true });
    const latest = readLatestNodeId(item.rule_id, source.sourceName);
    if (result.importStatus === 'failed' || !latest?.last_node_id) {
      return {
        detail: result.detail ?? 'Re-import did not update a topic.',
        node_id: latest?.last_node_id ?? null,
        reimported_at: reimportedAt,
        status: 'failed'
      };
    }
    return {
      detail: result.detail,
      node_id: latest.last_node_id,
      reimported_at: reimportedAt,
      status: 'reimported'
    };
  } catch (error) {
    return {
      detail: error instanceof Error ? error.message : 'Unknown re-import failure',
      node_id: null,
      reimported_at: reimportedAt,
      status: 'failed'
    };
  }
}
