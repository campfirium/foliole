import path from 'node:path';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';

import { buildRecoveryBindings } from './readwise-source-cutover-recovery-artifacts.js';
import {
  hashAttachmentFiles,
  hashImportSources,
  hashNodeRows,
  hashRecoveryValue,
  hashUnrelatedNodes,
  marks,
  recursiveNodeIds
} from './readwise-source-cutover-recovery-snapshot.js';
import type {
  ReadwiseCutoverRecoveryPlan,
  RecoveryCandidate,
  RecoveryWrongSourceRow
} from './readwise-source-cutover-recovery-types.js';

export type {
  ReadwiseCutoverRecoveryPlan,
  RecoveryBinding
} from './readwise-source-cutover-recovery-types.js';

export async function buildReadwiseCutoverRecoveryPlan(input: {
  databasePath: string;
  driver: DatabaseDriver;
  libraryHome: string;
}): Promise<ReadwiseCutoverRecoveryPlan> {
  const legacy = loadLegacyCutover(input.driver);
  const connectionRef = loadConnectionRef(input.driver);
  const candidates = loadCandidates(input.driver, connectionRef);
  const wrongSources = loadWrongSources(input.driver, connectionRef);
  assertFormalShape(candidates, wrongSources);
  const bindings = await buildRecoveryBindings({
    candidates,
    driver: input.driver,
    sourceHost: legacy.sourceHost,
    wrongSources
  });
  if (bindings.filter((item) => item.status === 'bound').length !== 30 ||
    bindings.filter((item) => item.status === 'suppressed').length !== 1) {
    throw new Error('readwise_recovery_identity_shape_changed');
  }
  const wrongNodeIds = recursiveNodeIds(input.driver, wrongSources.map((item) => item.latest_node_id));
  assertNoReviews(input.driver, wrongNodeIds);
  const attachmentRelations = loadAttachmentRelations(input.driver, wrongNodeIds);
  const attachmentIds = [...new Set(attachmentRelations.map((item) => item.attachmentId))].sort();
  const originalNodeIds = recursiveNodeIds(
    input.driver,
    bindings.flatMap((item) => item.nodeId ? [item.nodeId] : [])
  );
  const sourceFingerprints = [...new Set(bindings.flatMap((item) => [
    item.targetSourceFingerprint,
    item.wrongSourceFingerprint
  ]).filter((item): item is string => Boolean(item)))].sort();
  const stable = {
    attachmentFileHash: await hashAttachmentFiles(input.libraryHome, attachmentIds),
    attachmentIds,
    attachmentRelations,
    bindings,
    cohortDocumentIds: candidates.map((item) => item.documentId),
    connectionRef,
    databasePath: path.resolve(input.databasePath),
    importSourceHash: hashImportSources(input.driver, sourceFingerprints),
    originalNodeHash: hashNodeRows(input.driver, originalNodeIds),
    sourceHost: legacy.sourceHost,
    startedAt: legacy.startedAt,
    unrelatedNodeHash: hashUnrelatedNodes(input.driver, wrongNodeIds),
    version: 1 as const,
    wrongNodeHash: hashNodeRows(input.driver, wrongNodeIds),
    wrongNodeIds
  };
  return {
    ...stable,
    generatedAt: new Date().toISOString(),
    manifestHash: hashRecoveryValue(stable)
  };
}

export function verifyRecoveryPlan(
  current: ReadwiseCutoverRecoveryPlan,
  expected: ReadwiseCutoverRecoveryPlan
) {
  if (expected.manifestHash !== current.manifestHash || expected.databasePath !== current.databasePath) {
    throw new Error('readwise_recovery_manifest_changed');
  }
}

function loadLegacyCutover(driver: DatabaseDriver) {
  const value = settingJson(driver, 'readwise_source_cutover') as Record<string, unknown>;
  if (value.version !== 1 || value.status !== 'migration-in-progress' ||
    typeof value.sourceHost !== 'string' || typeof value.startedAt !== 'string') {
    throw new Error('readwise_recovery_legacy_cutover_required');
  }
  return { sourceHost: value.sourceHost, startedAt: value.startedAt };
}

function loadConnectionRef(driver: DatabaseDriver) {
  const value = settingJson(driver, 'readwise_remote_source') as Record<string, unknown>;
  if (typeof value.connectionRef !== 'string' || !value.connectionRef) {
    throw new Error('readwise_recovery_connection_missing');
  }
  return value.connectionRef;
}

function loadCandidates(driver: DatabaseDriver, connectionRef: string) {
  return driver.queryAll<{ payload_json: string }>(
    "SELECT payload_json FROM readwise_api_import_stage WHERE connection_ref = ? " +
      "AND record_kind = 'candidate-v2' ORDER BY remote_id",
    [connectionRef]
  ).map((row) => JSON.parse(row.payload_json) as RecoveryCandidate);
}

function loadWrongSources(driver: DatabaseDriver, connectionRef: string) {
  return driver.queryAll<RecoveryWrongSourceRow>(
    "SELECT source_fingerprint, remote_document_id, latest_node_id FROM import_sources " +
      "WHERE remote_provider = 'readwise' AND remote_connection_ref = ? " +
      'AND source_ref IS NULL AND latest_node_id IS NOT NULL ORDER BY remote_document_id',
    [connectionRef]
  );
}

function assertFormalShape(candidates: RecoveryCandidate[], wrongSources: RecoveryWrongSourceRow[]) {
  if (candidates.length !== 31 || wrongSources.length !== 30 ||
    candidates.filter((item) => item.status === 'completed').length !== 30 ||
    candidates.filter((item) => item.status === 'failed').length !== 1) {
    throw new Error('readwise_recovery_formal_shape_changed');
  }
}

function assertNoReviews(driver: DatabaseDriver, nodeIds: string[]) {
  const row = driver.queryOne<{ count: number }>(
    'SELECT COUNT(*) count FROM node_review WHERE node_id IN (' + marks(nodeIds) + ')',
    nodeIds
  );
  if ((row?.count ?? 0) !== 0) throw new Error('readwise_recovery_wrong_tree_has_reviews');
}

function loadAttachmentRelations(driver: DatabaseDriver, nodeIds: string[]) {
  return driver.queryAll<{ attachment_id: string; node_id: string; role: string }>(
    'SELECT node_id, attachment_id, role FROM node_attachments WHERE node_id IN (' +
      marks(nodeIds) + ') ORDER BY node_id, attachment_id, role',
    nodeIds
  ).map((row) => ({
    attachmentId: row.attachment_id,
    nodeId: row.node_id,
    role: row.role
  }));
}

function settingJson(driver: DatabaseDriver, key: string) {
  const value = driver.queryOne<{ value: string }>('SELECT value FROM settings WHERE key=?', [key])?.value;
  if (!value) throw new Error('readwise_recovery_setting_missing:' + key);
  return JSON.parse(value) as unknown;
}
