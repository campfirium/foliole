import fs from 'node:fs/promises';
import path from 'node:path';

import type { NativeRestoreUnsyncedSourceResult } from '../../lib/platform/nativeUnsyncedSourcesContract.js';
import { openDatabaseConnection } from '../database/connection.js';
import { resolveImportKind, type DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import { runSingleKeepImportSource } from './keepImportRunSource.js';
import type { KeepImportRuleConfig } from './keepImportService.js';

function resolveRuleConfig(ruleId: string): KeepImportRuleConfig | null {
  const settings = loadImportManagerSettings();
  const readwiseRule = settings.readwiseSources.find((entry) => entry.id === ruleId);
  if (readwiseRule?.primaryPath.trim()) {
    return {
      directoryPath: readwiseRule.primaryPath.trim(),
      highlightPolicy: 'reference_only',
      ruleId,
      sourceType: 'readwise'
    };
  }
  const genericRule = settings.sources.find((entry) => entry.id === ruleId);
  if (!genericRule?.primaryPath.trim()) {
    return null;
  }
  return {
    directoryPath: genericRule.primaryPath.trim(),
    highlightPolicy: genericRule.highlightMode === 'merged' ? 'adopt' : 'reference_only',
    ruleId,
    sourceType: 'generic'
  };
}

async function buildSourceDescriptor(config: KeepImportRuleConfig, sourcePath: string): Promise<DirectoryImportSourceDescriptor> {
  const filePath = path.isAbsolute(sourcePath) ? sourcePath : path.join(config.directoryPath, sourcePath);
  const stats = await fs.stat(filePath);
  const kind = resolveImportKind(filePath);
  return {
    adapterId: kind === 'html' ? 'html_directory' : kind === 'text' ? 'text_directory' : 'markdown_directory',
    filePath,
    kind,
    mtimeMs: stats.mtimeMs,
    sizeBytes: stats.size,
    sourceName: path.isAbsolute(sourcePath) ? path.basename(sourcePath) : sourcePath
  };
}

function unblockUnsyncedSource(ruleId: string, sourcePath: string, restoredAt: string) {
  openDatabaseConnection().sqlite.prepare(
    `UPDATE keep_import_items
     SET last_node_id = NULL,
         local_node_state = 'not_imported',
         last_status = 'discovered',
         last_seen_at = ?
     WHERE rule_id = ? AND source_path = ?`
  ).run(restoredAt, ruleId, sourcePath);
}

function reblockUnsyncedSource(ruleId: string, sourcePath: string, restoredAt: string) {
  openDatabaseConnection().sqlite.prepare(
    `UPDATE keep_import_items
     SET local_node_state = 'locally_deleted',
         last_status = 'blocked_deleted',
         last_seen_at = ?
     WHERE rule_id = ? AND source_path = ?`
  ).run(restoredAt, ruleId, sourcePath);
}

export async function restoreUnsyncedSource(ruleId: string, sourcePath: string): Promise<NativeRestoreUnsyncedSourceResult> {
  const restoredAt = new Date().toISOString();
  const config = resolveRuleConfig(ruleId);
  if (!config) {
    return { detail: 'The watch folder for this source is no longer configured.', node_id: null, restored_at: restoredAt, status: 'failed' };
  }
  try {
    const source = await buildSourceDescriptor(config, sourcePath);
    unblockUnsyncedSource(ruleId, source.sourceName, restoredAt);
    const result = await runSingleKeepImportSource(config, source, { forceTopicImport: true });
    if (result.importStatus === 'failed' || !result.importStatus) {
      reblockUnsyncedSource(ruleId, source.sourceName, restoredAt);
    }
    const nodeId = openDatabaseConnection().sqlite
      .prepare('SELECT last_node_id FROM keep_import_items WHERE rule_id = ? AND source_path = ?')
      .get(ruleId, source.sourceName) as { last_node_id: string | null } | undefined;
    if (!nodeId?.last_node_id) {
      reblockUnsyncedSource(ruleId, source.sourceName, restoredAt);
      return {
        detail: result.detail ?? 'Import again did not create a topic.',
        node_id: null,
        restored_at: restoredAt,
        status: 'failed'
      };
    }
    return {
      detail: result.detail,
      node_id: nodeId.last_node_id,
      restored_at: restoredAt,
      status: result.importStatus === 'failed' || !result.importStatus ? 'failed' : 'restored'
    };
  } catch (error) {
    reblockUnsyncedSource(ruleId, sourcePath, restoredAt);
    return {
      detail: error instanceof Error ? error.message : 'Unknown restore failure',
      node_id: null,
      restored_at: restoredAt,
      status: 'failed'
    };
  }
}
