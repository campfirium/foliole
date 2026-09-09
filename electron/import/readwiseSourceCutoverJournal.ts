import { recordImportSourceSync } from '../../lib/core/database/importPipelineRecords.js';
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import {
  isReadwiseObjectCreatedAfter,
  type ReadwiseSourceCutover
} from '../../lib/core/readwise/readwiseSourceCutover.js';
import { openDatabaseConnection } from '../database/connection.js';
import {
  confirmReadwiseIdentityBindings,
  type ConfirmedReadwiseIdentityBinding
} from '../database/readwiseRemoteIdentity.js';
import { loadReadwiseSourceCutover, writeReadwiseSourceCutover } from '../database/readwiseSourceCutover.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import { prepareReadwiseApiImportRecord } from './readwiseApiMaterialization.js';
import {
  prepareReadwiseSourceCutoverIdentity,
  type ReadwiseSourceCutoverIdentityBinding
} from './readwiseSourceCutoverIdentity.js';
import { applyPristineReadwiseSourceProjection } from './readwiseSourceMigrationProjection.js';

export function promoteReadwiseSourceCutoverCohort(documentIds: string[]) {
  const current = loadReadwiseSourceCutover();
  if (!current || current.status !== 'migration-in-progress') {
    throw new Error('readwise_source_migration_not_active');
  }
  if (current.version === 2) {
    const currentIds = new Set(current.cohortDocumentIds);
    const nextIds = new Set(documentIds);
    if (nextIds.size !== documentIds.length || nextIds.size !== currentIds.size ||
      documentIds.some((id) => !currentIds.has(id))) {
      throw new Error('readwise_source_migration_cohort_changed');
    }
    return;
  }
  writeReadwiseSourceCutover({
    annotations: [],
    cohortDocumentIds: documentIds,
    completedAt: current.completedAt,
    documents: [],
    retiredNodeIds: [],
    sourceHost: current.sourceHost,
    startedAt: current.startedAt,
    status: current.status
  }, current.startedAt);
}

export function createReadwiseDocumentMigration(input: {
  bindingFor: (document: PreparedReadwiseApiDocument) => ReadwiseSourceCutoverIdentityBinding | null;
}, connectionRef: string) {
  const pending = new Map<string, ReadwiseSourceCutoverIdentityBinding>();
  return {
    async beforeCommit(document: PreparedReadwiseApiDocument) {
      const existingClassification = requireReadwiseSourceCutoverV2().documents
        .find((item) => item.remoteId === document.id);
      if (existingClassification?.status === 'suppressed') return { skip: true };
      const existingBinding = loadExistingBinding(connectionRef, document.id);
      if (existingClassification?.status === 'bound' && !existingBinding) {
        throw new Error('readwise_source_cutover_binding_missing');
      }
      const binding = existingBinding ?? input.bindingFor(document);
      if (!binding) {
        recordClassification(document, null);
        return { skip: true };
      }
      if (!binding.sourceFingerprint) adoptBookSource(connectionRef, document, binding);
      if (!loadExistingBinding(connectionRef, document.id)) {
        confirmReadwiseIdentityBindings(connectionRef, [binding]);
      }
      pending.set(document.id, binding);
      const boundIds = new Set(binding.annotations.map((item) => item.remoteId));
      const replaceExistingBody = await applyPristineReadwiseSourceProjection(
        binding.sourceFingerprint,
        document
      );
      return {
        document: { ...document, annotations: document.annotations.filter((item) => boundIds.has(item.remoteId)) },
        replaceExistingBody
      };
    },
    afterCommit(document: PreparedReadwiseApiDocument) {
      const binding = pending.get(document.id);
      if (!binding) throw new Error('readwise_source_cutover_binding_missing');
      recordClassification(document, binding);
      pending.delete(document.id);
    }
  };
}

function recordClassification(
  document: PreparedReadwiseApiDocument,
  binding: ReadwiseSourceCutoverIdentityBinding | null
) {
  const current = requireReadwiseSourceCutoverV2();
  if (current.documents.some((item) => item.remoteId === document.id)) return;
  const byRemote = new Map(binding?.annotations.map((item) => [item.remoteId, item.nodeId]) ?? []);
  writeReadwiseSourceCutover({
    ...current,
    annotations: [...current.annotations, ...document.annotations.map((item) => ({
      nodeId: byRemote.get(item.remoteId) ?? null,
      remoteId: item.remoteId,
      status: byRemote.has(item.remoteId) ? 'bound' as const : 'suppressed' as const
    }))],
    documents: [...current.documents, {
      nodeId: binding?.nodeId ?? null,
      remoteId: document.id,
      status: binding ? 'bound' : 'suppressed'
    }]
  });
}

function adoptBookSource(
  connectionRef: string,
  document: PreparedReadwiseApiDocument,
  binding: ReadwiseSourceCutoverIdentityBinding
) {
  const now = new Date().toISOString();
  const prepared = prepareReadwiseApiImportRecord({
    config: loadImportManagerSettings().readwiseReaderConfig,
    connectionRef,
    document
  }, null, now);
  binding.sourceFingerprint = prepared.sourceFingerprint;
  const database = openDatabaseConnection().driver;
  const existing = database.queryOne<{ latest_node_id: string }>(
    'SELECT latest_node_id FROM import_sources WHERE source_fingerprint = ?',
    [prepared.sourceFingerprint]
  );
  if (existing) {
    if (existing.latest_node_id !== binding.nodeId) {
      throw new Error('readwise_source_cutover_book_source_conflict');
    }
    return;
  }
  database.transaction((driver) => {
    driver.execute(
      'INSERT INTO import_sources (source_fingerprint, provider, source_kind, source_name, ' +
      'source_locator, first_imported_at, last_imported_at, last_content_fingerprint, latest_node_id) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        prepared.sourceFingerprint, prepared.provider, prepared.sourceKind, prepared.sourceName,
        prepared.sourceLocator, now, now, prepared.contentFingerprint, binding.nodeId
      ]
    );
    recordImportSourceSync(driver, prepared.sourceFingerprint, now);
  });
}

function loadExistingBinding(
  connectionRef: string,
  documentId: string
): ReadwiseSourceCutoverIdentityBinding | null {
  const row = openDatabaseConnection().driver.queryOne<{
    latest_node_id: string;
    remote_annotations_json: string;
    remote_document_id: string;
    source_fingerprint: string;
  }>(
    "SELECT source_fingerprint, latest_node_id, remote_document_id, remote_annotations_json " +
      "FROM import_sources WHERE remote_provider = 'readwise' AND remote_connection_ref = ? " +
      'AND remote_document_id = ?',
    [connectionRef, documentId]
  );
  if (!row?.latest_node_id) return null;
  try {
    return {
      annotations: JSON.parse(row.remote_annotations_json) as ConfirmedReadwiseIdentityBinding['annotations'],
      nodeId: row.latest_node_id,
      remoteDocumentId: row.remote_document_id,
      sourceFingerprint: row.source_fingerprint
    };
  } catch {
    return null;
  }
}

export function completeReadwiseSourceCutoverMigration() {
  const current = requireReadwiseSourceCutoverV2();
  const completedAt = new Date().toISOString();
  writeReadwiseSourceCutover({ ...current, completedAt, status: 'api' }, completedAt);
}

export async function createPostCutoverReadwiseDocumentPolicy(connectionRef: string) {
  const current = loadReadwiseSourceCutover();
  if (!current || current.version !== 2 || current.status !== 'api') return null;
  const migration = createReadwiseDocumentMigration(
    await prepareReadwiseSourceCutoverIdentity(),
    connectionRef
  );
  const pending = new Set<string>();
  return {
    async beforeCommit(document: PreparedReadwiseApiDocument) {
      const state = requireReadwiseSourceCutoverV2();
      const classified = state.documents.some((item) => item.remoteId === document.id);
      if (!classified && isReadwiseObjectCreatedAfter(document.createdAt, state.startedAt)) return;
      const options = await migration.beforeCommit(document);
      if (!options?.skip) pending.add(document.id);
      return options;
    },
    afterCommit(document: PreparedReadwiseApiDocument) {
      if (!pending.delete(document.id)) return;
      migration.afterCommit(document);
    }
  };
}

export function requireReadwiseSourceCutoverV2(): ReadwiseSourceCutover {
  const state = loadReadwiseSourceCutover();
  if (!state || state.version !== 2) throw new Error('readwise_source_cutover_v2_required');
  return state;
}
