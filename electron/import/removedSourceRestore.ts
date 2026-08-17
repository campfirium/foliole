import type { NativeRestoreRemovedSourceResult } from '../../lib/platform/nativeRemovedSourcesContract.js';
import { openDatabaseConnection } from '../database/connection.js';

import { buildKeepImportSourceDescriptor, resolveKeepImportRuleConfig } from './keepImportManualSource.js';
import { runSingleKeepImportSource } from './keepImportRunSource.js';

function unblockRemovedSource(ruleId: string, sourcePath: string, restoredAt: string) {
  openDatabaseConnection().sqlite.prepare(
    `UPDATE keep_import_items
     SET last_node_id = NULL,
         local_node_state = 'not_imported',
         last_status = 'discovered',
         last_seen_at = ?
     WHERE rule_id = ? AND source_path = ?`
  ).run(restoredAt, ruleId, sourcePath);
}

function reblockRemovedSource(ruleId: string, sourcePath: string, restoredAt: string) {
  openDatabaseConnection().sqlite.prepare(
    `UPDATE keep_import_items
     SET local_node_state = 'locally_deleted',
         last_status = 'blocked_deleted',
         last_seen_at = ?
     WHERE rule_id = ? AND source_path = ?`
  ).run(restoredAt, ruleId, sourcePath);
}

function shouldForceRemovedSourceTopicImport(config: NonNullable<ReturnType<typeof resolveKeepImportRuleConfig>>) {
  return config.sourceType !== 'readwise';
}

function isSuccessfulRemovedSourceImport(status: Awaited<ReturnType<typeof runSingleKeepImportSource>>['importStatus']) {
  return Boolean(status && status !== 'failed');
}

export async function restoreRemovedSource(ruleId: string, sourcePath: string): Promise<NativeRestoreRemovedSourceResult> {
  const restoredAt = new Date().toISOString();
  const config = resolveKeepImportRuleConfig(ruleId);
  if (!config) {
    return { detail: 'The watch folder for this source is no longer configured.', node_id: null, restored_at: restoredAt, status: 'failed' };
  }
  try {
    const source = await buildKeepImportSourceDescriptor(config, sourcePath);
    unblockRemovedSource(ruleId, source.sourceName, restoredAt);
    const result = await runSingleKeepImportSource(config, source, {
      forceTopicImport: shouldForceRemovedSourceTopicImport(config)
    });
    if (result.importStatus === 'failed' || !result.importStatus) {
      reblockRemovedSource(ruleId, source.sourceName, restoredAt);
    }
    const nodeId = openDatabaseConnection().sqlite
      .prepare('SELECT last_node_id FROM keep_import_items WHERE rule_id = ? AND source_path = ?')
      .get(ruleId, source.sourceName) as { last_node_id: string | null } | undefined;
    if (!nodeId?.last_node_id && !isSuccessfulRemovedSourceImport(result.importStatus)) {
      reblockRemovedSource(ruleId, source.sourceName, restoredAt);
      return {
        detail: result.detail ?? 'Import again did not create a topic.',
        node_id: null,
        restored_at: restoredAt,
        status: 'failed'
      };
    }
    return {
      detail: result.detail,
      node_id: nodeId?.last_node_id ?? null,
      restored_at: restoredAt,
      status: isSuccessfulRemovedSourceImport(result.importStatus) ? 'restored' : 'failed'
    };
  } catch (error) {
    reblockRemovedSource(ruleId, sourcePath, restoredAt);
    return {
      detail: error instanceof Error ? error.message : 'Unknown restore failure',
      node_id: null,
      restored_at: restoredAt,
      status: 'failed'
    };
  }
}
