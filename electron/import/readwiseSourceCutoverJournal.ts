import { recordImportSourceSync } from '../../lib/core/database/importPipelineRecords.js';
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import type { ReadwiseSourceCutover } from '../../lib/core/readwise/readwiseSourceCutover.js';
import { openDatabaseConnection } from '../database/connection.js';
import { completeReadwiseApiCandidateRun } from '../database/readwiseApiCandidateRun.js';
import {
  confirmReadwiseIdentityBindings
} from '../database/readwiseRemoteIdentity.js';
import { loadReadwiseSourceCutover, writeReadwiseSourceCutover } from '../database/readwiseSourceCutover.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import { hasPersistedReadwiseApiEpubStructure } from './readwiseApiEpubMaterialization.js';
import { prepareReadwiseApiImportRecord } from './readwiseApiMaterialization.js';
import type { ReadwiseApiMaterializationResult } from './readwiseApiMaterialization.js';
import {
  loadReadwiseSourceCutoverBinding,
  recordReadwiseSourceCutoverClassification
} from './readwiseSourceCutoverClassification.js';
import {
  type ReadwiseSourceCutoverIdentityBinding
} from './readwiseSourceCutoverIdentity.js';
import {
  assertReadwiseSourceCutoverComplete,
  recordReadwiseUnavailableAnnotationTerminals
} from './readwiseSourceCutoverTerminal.js';
import {
  applyReadwiseSourceProjection,
  mergeLegacyReadwiseAnnotations
} from './readwiseSourceMigrationProjection.js';

export function promoteReadwiseSourceCutoverCohort(documentIds: string[]) {
  const current = loadReadwiseSourceCutover();
  if (!current || current.status !== 'migration-in-progress') {
    throw new Error('readwise_source_migration_not_active');
  }
  if (current.version === 2) {
    if (current.cohortDocumentIds.length === 0 && current.documents.length === 0) {
      writeReadwiseSourceCutover({ ...current, cohortDocumentIds: documentIds });
      return;
    }
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
}, connectionRef: string, options: { forceSourceProjection?: boolean } = {}) {
  const pending = new Map<string, ReadwiseSourceCutoverIdentityBinding | null>();
  return {
    async beforeCommit(document: PreparedReadwiseApiDocument) {
      return prepareReadwiseDocumentCommit(document, input, connectionRef, options, pending);
    },
    afterCommit(document: PreparedReadwiseApiDocument, result: ReadwiseApiMaterializationResult) {
      const binding = pending.get(document.id);
      if (binding === undefined) throw new Error('readwise_source_cutover_binding_missing');
      if (result.status === 'blocked') {
        recordReadwiseSourceCutoverClassification(document, 'blocked', binding);
      } else if (binding) {
        const materialized = loadReadwiseSourceCutoverBinding(connectionRef, document.id);
        if (!materialized) throw new Error('readwise_source_cutover_materialization_missing');
        recordReadwiseSourceCutoverClassification(document, 'bound', materialized);
      } else if (result.status === 'external_pending') {
        recordReadwiseSourceCutoverClassification(document, 'external', null);
      } else if (result.status === 'skipped') {
        recordReadwiseSourceCutoverClassification(document, 'unavailable', null);
      } else if (result.status === 'imported' || result.status === 'degraded') {
        const materialized = loadReadwiseSourceCutoverBinding(connectionRef, document.id);
        if (!materialized) throw new Error('readwise_source_cutover_materialization_missing');
        recordReadwiseSourceCutoverClassification(document, 'materialized', materialized);
      } else {
        throw new Error('readwise_source_cutover_materialization_failed');
      }
      pending.delete(document.id);
    }
  };
}

function prepareReadwiseDocumentCommit(
  document: PreparedReadwiseApiDocument,
  input: { bindingFor: (value: PreparedReadwiseApiDocument) => ReadwiseSourceCutoverIdentityBinding | null },
  connectionRef: string,
  options: { forceSourceProjection?: boolean },
  pending: Map<string, ReadwiseSourceCutoverIdentityBinding | null>
) {
  const classification = requireReadwiseSourceCutoverV2().documents.find((item) => item.remoteId === document.id);
  if (classification?.status === 'suppressed') return { skip: true };
  const existing = loadReadwiseSourceCutoverBinding(connectionRef, document.id);
  if (classification?.status === 'bound' && !existing) throw new Error('readwise_source_cutover_binding_missing');
  const discovered = input.bindingFor(document);
  if (existing && discovered && existing.nodeId !== discovered.nodeId) {
    throw new Error('readwise_source_cutover_binding_conflict');
  }
  const binding = existing ? {
    ...existing,
    legacyAnnotations: discovered?.legacyAnnotations ?? []
  } : discovered;
  pending.set(document.id, binding);
  if (!binding) return;
  if (!binding.sourceFingerprint) adoptBookSource(connectionRef, document, binding);
  if (!existing) confirmReadwiseIdentityBindings(connectionRef, [binding]);
  if (!options.forceSourceProjection) {
    if (!existing) return;
    applyReadwiseSourceProjection(existing.nodeId, document);
    return { document, replaceExistingBody: true };
  }
  const projectedDocument = mergeLegacyReadwiseAnnotations(document, binding.legacyAnnotations);
  applyReadwiseSourceProjection(binding.nodeId, projectedDocument);
  return {
    document: projectedDocument,
    ...(shouldBuildBoundEpub(binding.nodeId, projectedDocument) ? { forceEpubStructure: true } : {}),
    replaceExistingBody: true
  };
}

function shouldBuildBoundEpub(nodeId: string, document: PreparedReadwiseApiDocument) {
  return document.category === 'epub'
    && Boolean(document.epubStructure?.sections.length)
    && !hasPersistedReadwiseApiEpubStructure(nodeId);
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
    destination: 'inbox',
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

export function completeReadwiseSourceCutoverMigration(connectionRef: string) {
  requireReadwiseSourceCutoverV2();
  recordReadwiseUnavailableAnnotationTerminals(connectionRef);
  assertReadwiseSourceCutoverComplete(connectionRef);
  const completedAt = new Date().toISOString();
  const latest = requireReadwiseSourceCutoverV2();
  writeReadwiseSourceCutover({
    ...latest,
    completedAt,
    completionVersion: 2,
    phase: null,
    status: 'api'
  }, completedAt);
  completeReadwiseApiCandidateRun(connectionRef, 'cutover', completedAt);
}

export function setReadwiseSourceCutoverPhase(phase: 'indexing' | 'merging') {
  const current = requireReadwiseSourceCutoverV2();
  if (current.status !== 'migration-in-progress') throw new Error('readwise_source_migration_not_active');
  writeReadwiseSourceCutover({ ...current, phase });
}

export function requireReadwiseSourceCutoverV2(): ReadwiseSourceCutover {
  const state = loadReadwiseSourceCutover();
  if (!state || state.version !== 2) throw new Error('readwise_source_cutover_v2_required');
  return state;
}
