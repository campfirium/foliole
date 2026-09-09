import { createHash } from 'node:crypto';

import { flushNodeSyncVersionWithDriver } from '../../electron/database/nodeSyncVersionFromDriver.js';
import { writeSettingRecord } from '../../electron/database/settingRecords.js';
import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import {
  recordImportSourceDeletionSync,
  recordImportSourceSync
} from '../../lib/core/database/importPipelineRecords.js';
import { requireDatabaseHostName } from '../../lib/core/database/syncHostIdentity.js';
import { normalizeReadwiseSourceCutover } from '../../lib/core/readwise/readwiseSourceCutover.js';

import type {
  ReadwiseCutoverRecoveryPlan,
  RecoveryBinding
} from './readwise-source-cutover-recovery-plan.js';
import {
  hashAttachmentFiles,
  hashNodeRows,
  hashUnrelatedNodes,
  marks,
  recursiveNodeIds
} from './readwise-source-cutover-recovery-snapshot.js';

export function applyReadwiseCutoverRecovery(
  driver: DatabaseDriver,
  plan: ReadwiseCutoverRecoveryPlan,
  now = new Date().toISOString()
) {
  const hostName = requireDatabaseHostName(driver);
  driver.transaction((tx) => {
    for (const nodeId of plan.wrongNodeIds) {
      flushNodeSyncVersionWithDriver(tx, nodeId, hostName, now);
    }
    for (const binding of plan.bindings) transferBinding(tx, plan.connectionRef, binding, now);
    tx.execute(
      'DELETE FROM node_attachments WHERE node_id IN (' + marks(plan.wrongNodeIds) + ')',
      plan.wrongNodeIds
    );
    tx.execute(
      'UPDATE nodes SET deleted_at = ?, updated_at = ?, last_modified_by_host_name = ?, sync_dirty = 1 ' +
        'WHERE id IN (' + marks(plan.wrongNodeIds) + ') AND deleted_at IS NULL',
      [now, now, hostName, ...plan.wrongNodeIds]
    );
    for (const nodeId of plan.wrongNodeIds) {
      if (!flushNodeSyncVersionWithDriver(tx, nodeId, hostName, now)) {
        throw new Error('readwise_recovery_node_tombstone_failed:' + nodeId);
      }
    }
    tx.execute('DELETE FROM readwise_api_import_stage WHERE connection_ref = ?', [plan.connectionRef]);
    tx.execute('DELETE FROM readwise_api_import_runs WHERE connection_ref = ?', [plan.connectionRef]);
    const state = {
      annotations: plan.bindings.flatMap((item) => item.annotations),
      cohortDocumentIds: plan.cohortDocumentIds,
      completedAt: now,
      documents: plan.bindings.map(({ nodeId, remoteId, status }) => ({ nodeId, remoteId, status })),
      retiredNodeIds: plan.wrongNodeIds,
      sourceHost: plan.sourceHost,
      startedAt: plan.startedAt,
      status: 'api' as const,
      version: 2 as const
    };
    normalizeReadwiseSourceCutover(state);
    writeCutoverState(tx, state, now);
  });
}

function writeCutoverState(driver: DatabaseDriver, state: unknown, now: string) {
  const journal = state as {
    annotations: unknown[]; cohortDocumentIds: unknown[]; completedAt: string;
    documents: Array<{ status: string }>; sourceHost: string; startedAt: string; status: string;
  };
  writeSettingValue(driver, 'readwise_source_cutover_v2', journal, now);
  writeSettingValue(driver, 'readwise_source_cutover', {
    completedAt: journal.completedAt,
    completedCandidateCount: journal.documents.length,
    migratedCount: journal.documents.filter((item) => item.status === 'bound').length,
    sourceHost: journal.sourceHost,
    startedAt: journal.startedAt,
    status: journal.status,
    totalCandidateCount: journal.cohortDocumentIds.length,
    unmatchedCount: journal.documents.filter((item) => item.status === 'suppressed').length,
    version: 1
  }, now);
}

function writeSettingValue(driver: DatabaseDriver, key: string, state: unknown, now: string) {
  const valueJson = JSON.stringify(state);
  writeSettingRecord(driver, { key, updatedAt: now, valueJson });
  driver.execute(
    'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ' +
      'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
    [key, valueJson, now]
  );
}

export async function verifyAppliedReadwiseCutoverRecovery(input: {
  driver: DatabaseDriver;
  libraryHome: string;
  plan: ReadwiseCutoverRecoveryPlan;
}) {
  const state = normalizeReadwiseSourceCutover(settingJson(input.driver, 'readwise_source_cutover_v2'));
  if (!state || state.version !== 2 || state.status !== 'api') {
    throw new Error('readwise_recovery_state_not_completed');
  }
  const visibleWrong = scalar(
    input.driver,
    'SELECT COUNT(*) count FROM nodes WHERE id IN (' + marks(input.plan.wrongNodeIds) +
      ') AND deleted_at IS NULL',
    input.plan.wrongNodeIds
  );
  const remainingRelations = scalar(
    input.driver,
    'SELECT COUNT(*) count FROM node_attachments WHERE node_id IN (' + marks(input.plan.wrongNodeIds) + ')',
    input.plan.wrongNodeIds
  );
  if (visibleWrong !== 0 || remainingRelations !== 0) {
    throw new Error('readwise_recovery_retirement_incomplete');
  }
  for (const binding of input.plan.bindings) verifyBinding(input.driver, input.plan.connectionRef, binding);
  const originalIds = recursiveNodeIds(
    input.driver,
    input.plan.bindings.flatMap((item) => item.nodeId ? [item.nodeId] : [])
  );
  if (hashNodeRows(input.driver, originalIds) !== input.plan.originalNodeHash ||
    hashUnrelatedNodes(input.driver, input.plan.wrongNodeIds) !== input.plan.unrelatedNodeHash) {
    throw new Error('readwise_recovery_protected_nodes_changed');
  }
  const attachmentHash = await hashAttachmentFiles(input.libraryHome, input.plan.attachmentIds);
  if (attachmentHash !== input.plan.attachmentFileHash) {
    throw new Error('readwise_recovery_attachment_bytes_changed');
  }
  return {
    annotationsBound: state.annotations.filter((item) => item.status === 'bound').length,
    annotationsSuppressed: state.annotations.filter((item) => item.status === 'suppressed').length,
    attachmentsPreserved: input.plan.attachmentIds.length,
    documentsBound: state.documents.filter((item) => item.status === 'bound').length,
    documentsSuppressed: state.documents.filter((item) => item.status === 'suppressed').length,
    retiredNodes: input.plan.wrongNodeIds.length
  };
}

function transferBinding(
  driver: DatabaseDriver,
  connectionRef: string,
  binding: RecoveryBinding,
  now: string
) {
  if (binding.wrongSourceFingerprint && binding.targetSourceFingerprint) {
    deleteWrongSource(driver, binding.wrongSourceFingerprint, now);
  }
  if (binding.status === 'suppressed') {
    if (binding.wrongSourceFingerprint) deleteWrongSource(driver, binding.wrongSourceFingerprint, now);
    return;
  }
  if (!binding.nodeId) throw new Error('readwise_recovery_bound_node_missing');
  const sourceFingerprint = binding.targetSourceFingerprint ?? binding.wrongSourceFingerprint;
  if (!sourceFingerprint) throw new Error('readwise_recovery_bound_source_missing');
  const annotations = binding.annotations.filter((item) => item.status === 'bound' && item.nodeId);
  const annotationsJson = JSON.stringify(annotations.map((item) => ({
    kind: 'highlight', nodeId: item.nodeId, remoteId: item.remoteId
  })));
  const stateJson = JSON.stringify({
    annotations: annotations.map((item) => ({
      blockedAt: null,
      contentHash: nodeContentHash(driver, item.nodeId!),
      kind: 'highlight',
      nodeId: item.nodeId,
      parentRemoteId: binding.remoteId,
      remoteId: item.remoteId,
      remoteStatus: 'present',
      sourceUpdatedAt: null
    })),
    bodyState: 'materialized',
    documentBlockedAt: null,
    metadata: {},
    originalFile: null,
    remoteLifecycle: null,
    sourceUpdatedAt: null,
    version: 3
  });
  const changed = driver.execute(
    "UPDATE import_sources SET latest_node_id = ?, remote_provider = 'readwise', " +
      'remote_connection_ref = ?, remote_document_id = ?, remote_annotations_json = ?, ' +
      'remote_import_state_json = ? WHERE source_fingerprint = ?',
    [binding.nodeId, connectionRef, binding.remoteId, annotationsJson, stateJson, sourceFingerprint]
  );
  if (changed.changes !== 1) throw new Error('readwise_recovery_source_transfer_failed:' + binding.remoteId);
  recordImportSourceSync(driver, sourceFingerprint, now);
}

function deleteWrongSource(driver: DatabaseDriver, sourceFingerprint: string, now: string) {
  const changed = driver.execute('DELETE FROM import_sources WHERE source_fingerprint = ?', [sourceFingerprint]);
  if (changed.changes !== 1) throw new Error('readwise_recovery_wrong_source_missing:' + sourceFingerprint);
  recordImportSourceDeletionSync(driver, sourceFingerprint, now);
}

function verifyBinding(driver: DatabaseDriver, connectionRef: string, binding: RecoveryBinding) {
  const rows = driver.queryAll<{ latest_node_id: string }>(
    "SELECT latest_node_id FROM import_sources WHERE remote_provider = 'readwise' " +
      'AND remote_connection_ref = ? AND remote_document_id = ?',
    [connectionRef, binding.remoteId]
  );
  if (binding.status === 'suppressed') {
    if (rows.length !== 0) throw new Error('readwise_recovery_suppression_missing:' + binding.remoteId);
  } else if (rows.length !== 1 || rows[0]?.latest_node_id !== binding.nodeId) {
    throw new Error('readwise_recovery_binding_missing:' + binding.remoteId);
  }
}

function nodeContentHash(driver: DatabaseDriver, nodeId: string) {
  const content = driver.queryOne<{ content: string }>('SELECT content FROM nodes WHERE id = ?', [nodeId])?.content;
  if (content === undefined) throw new Error('readwise_recovery_annotation_node_missing:' + nodeId);
  return createHash('sha256').update(content).digest('hex');
}

function settingJson(driver: DatabaseDriver, key: string) {
  const value = driver.queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])?.value;
  if (!value) throw new Error('readwise_recovery_setting_missing:' + key);
  return JSON.parse(value) as unknown;
}

function scalar(driver: DatabaseDriver, sql: string, params: string[]) {
  return Number(driver.queryOne<{ count: number }>(sql, params)?.count ?? 0);
}
