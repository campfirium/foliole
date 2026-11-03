import {
  recordPreparedImportFailure as recordPreparedImportFailureViaDriver,
  runPreparedImport as runPreparedImportViaDriver,
  type RunPreparedImportOptions
} from '../../lib/core/database/index.js';
import { loadNodeBodyResolution, NodeBodyUnavailableError } from '../../lib/core/database/nodeBodyResolution.js';
import { upsertNodeResourceReference } from '../../lib/core/database/nodeResourceReferences.js';
import { applyParentContentChange } from '../../lib/core/database/parentContentMutation.js';
import { expandPartitionedNodeForImport, partitionStoredNodeBody } from '../../lib/core/database/partitionedNodeBodyMutation.js';
import type { PersistedImportRecord, PreparedImportRecord } from '../../lib/core/import/contract.js';
import { formatImportImageDegradation } from '../../lib/core/import/importImagePolicy.js';
import { rewriteImportedImageReferences } from '../../lib/core/import/importImageReferences.js';

import { openDatabaseConnection } from './connection.js';
import { prepareImportedNodeDeletionVersions } from './importedNodeDeletionVersions.js';
import { importMarkdownImageAttachment, importPdfSourceAttachment } from './importPipelineAttachments.js';

export type { PersistedImportRecord, PreparedImportRecord };

function appendDegradedReason(currentReason: string | null, nextReason: string | null) {
  if (!nextReason) {
    return currentReason;
  }
  if (!currentReason) {
    return nextReason;
  }
  return `${currentReason}; ${nextReason}`;
}

function readImportNodeContent(nodeId: string) {
  const driver = openDatabaseConnection().driver;
  const row = driver.queryOne<{ id: string; title: string }>(
    `SELECT n.id, n.title FROM nodes n
     WHERE n.id = ? AND n.deleted_at IS NULL`,
    [nodeId]
  );
  if (!row) return null;
  const body = loadNodeBodyResolution(driver, row.id);
  if (!body) throw new NodeBodyUnavailableError([row.id]);
  return { content: body.content, title: row.title };
}

function rewriteImportLocalImages(record: PersistedImportRecord, prepared: PreparedImportRecord) {
  if (
    (prepared.sourceKind !== 'markdown' && prepared.sourceKind !== 'html') ||
    !record.nodeId ||
    record.duplicateSemantic === 'duplicate' ||
    prepared.content.trim().length === 0
  ) {
    return record;
  }

  const nodeId = record.nodeId;
  const persistedNode = readImportNodeContent(nodeId);
  const currentContent = persistedNode?.content ?? prepared.content;
  const { content: rewrittenContent, degradedMessages } = rewriteImportedImageReferences(currentContent,
    reference => importMarkdownImageAttachment({ ...reference, nodeId, sourceLocator: prepared.sourceLocator }));

  if (rewrittenContent === currentContent && degradedMessages.length === 0) {
    return record;
  }

  const connection = openDatabaseConnection();
  if (rewrittenContent !== currentContent) {
    applyParentContentChange({
      driver: connection.driver,
      nextContent: rewrittenContent,
      nodeId,
      previousContent: currentContent,
      title: persistedNode?.title ?? prepared.nodeTitle,
      updatedAt: record.importedAt
    });
  }

  if (degradedMessages.length === 0) {
    return record;
  }

  const degradedReason = appendDegradedReason(
    record.degradedReason,
    formatImportImageDegradation(prepared.sourceKind, degradedMessages)
  );

  connection.driver.execute('UPDATE import_runs SET result_status = ?, degraded_reason = ? WHERE id = ?', [
    'degraded',
    degradedReason,
    record.importId
  ]);

  return {
    ...record,
    degradedReason,
    resultStatus: 'degraded' as const
  };
}

function linkPreparedLocalizedImages(record: PersistedImportRecord, prepared: PreparedImportRecord) {
  if (!record.nodeId) return;
  for (const reference of prepared.localizedImageResources ?? []) {
    const driver = openDatabaseConnection().driver;
    const row = driver.queryOne<{ resource_references: string }>('SELECT resource_references FROM nodes WHERE id = ?', [record.nodeId]);
    if (!row) throw new Error('image_import_node_unavailable');
    driver.execute('UPDATE nodes SET resource_references = ?, sync_dirty = 1 WHERE id = ?',
      [upsertNodeResourceReference(row.resource_references, reference), record.nodeId]);
  }
}

export function runPreparedImport(input: PreparedImportRecord, options?: RunPreparedImportOptions) {
  const { driver, sqlite } = openDatabaseConnection();
  // Reserve the SQLite writer before import lookups establish a read snapshot.
  return sqlite.transaction(() => {
    const existing = driver.queryOne<{ id: string }>(
      options?.forceUpdateExistingNodeId
        ? 'SELECT id FROM nodes WHERE id = ? AND deleted_at IS NULL'
        : `SELECT n.id FROM import_sources source JOIN nodes n ON n.id = source.latest_node_id
           WHERE source.source_fingerprint = ? AND n.deleted_at IS NULL`,
      [options?.forceUpdateExistingNodeId ?? input.sourceFingerprint]
    );
    if (existing) expandPartitionedNodeForImport(driver, existing.id, input.importedAt);
    const imported = runPreparedImportViaDriver(driver, input, {
      ...options, prepareDeletionVersions: (nodeIds, deletedAt) => prepareImportedNodeDeletionVersions(driver, nodeIds, deletedAt)
    });
    const record = rewriteImportLocalImages(imported, input);
    linkPreparedLocalizedImages(record, input);
    if (input.sourceKind === 'pdf' && record.nodeId && record.resultStatus !== 'failed') {
      importPdfSourceAttachment(record.nodeId, input.sourceLocator);
    }
    if (record.nodeId && record.resultStatus !== 'failed') {
      partitionStoredNodeBody(driver, record.nodeId, record.importedAt);
    }
    return record;
  }).immediate();
}

export function recordPreparedImportFailure(input: PreparedImportRecord, failureReason: string) {
  const { driver, sqlite } = openDatabaseConnection();
  return sqlite.transaction(() => recordPreparedImportFailureViaDriver(driver, input, failureReason)).immediate();
}
