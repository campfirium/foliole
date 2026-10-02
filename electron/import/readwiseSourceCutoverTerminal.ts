import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadReadwiseSourceCutover } from '../database/readwiseSourceCutover.js';

import { verifyCutoverEpub } from './readwiseCutoverProjection.js';

export function assertReadwiseSourceCutoverComplete(
  connectionRef: string,
  documents: PreparedReadwiseApiDocument[]
) {
  const current = requireActiveCutover();
  const failed = new Set(current.failures?.map((item) => item.remoteId));
  if (current.failures?.some((failure) => !current.documents.some((item) =>
    item.remoteId === failure.remoteId && item.status === 'unavailable' && item.reason === failure.reason))) {
    throw new Error('readwise_source_cutover_failures_unrecorded');
  }
  const candidateIds = new Set(documents.map((item) => item.id));
  if (!sameSet(candidateIds, new Set(current.cohortDocumentIds))) {
    throw new Error('readwise_source_cutover_cohort_incomplete');
  }
  const documentTerminals = new Set(current.documents.map((item) => item.remoteId));
  if (!sameSet(candidateIds, documentTerminals)) {
    throw new Error('readwise_source_cutover_document_terminals_incomplete');
  }
  const expectedAnnotations = new Set(documents.flatMap((document) =>
    document.annotations.map((annotation) => annotation.remoteId)));
  const annotationTerminals = new Set(current.annotations.map((item) => item.remoteId));
  if (!sameSet(expectedAnnotations, annotationTerminals)) {
    throw new Error('readwise_source_cutover_annotation_terminals_incomplete');
  }
  if (countPendingReadwiseSourceBodies(connectionRef, failed) > 0) {
    throw new Error('readwise_source_cutover_pending_bodies');
  }
  assertCurrentEpubProjections(connectionRef, documents, current.documents);
}

function assertCurrentEpubProjections(
  connectionRef: string,
  documents: PreparedReadwiseApiDocument[],
  terminals: ReturnType<typeof requireActiveCutover>['documents']
) {
  const statusById = new Map(terminals.map((item) => [item.remoteId, item.status]));
  for (const document of documents) {
    const status = statusById.get(document.id);
    if (status !== 'materialized' && status !== 'bound') continue;
    if (document.category !== 'epub') continue;
    verifyCutoverEpub(connectionRef, document);
  }
}

export function countPendingReadwiseSourceBodies(connectionRef: string, failed = new Set<string>()) {
  return openDatabaseConnection().driver.queryAll<{ remote_document_id: string }>(
    `SELECT remote_document_id FROM import_sources
     WHERE remote_provider = 'readwise' AND remote_connection_ref = ?
       AND json_extract(remote_import_state_json, '$.sourceUpdate.status') = 'pending'`,
    [connectionRef]
  ).filter((item) => !failed.has(item.remote_document_id)).length;
}

function requireActiveCutover() {
  const state = loadReadwiseSourceCutover();
  if (!state || state.version !== 2 || state.status !== 'migration-in-progress') {
    throw new Error('readwise_source_migration_not_active');
  }
  return state;
}

function sameSet(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  return left.size === right.size && [...left].every((item) => right.has(item));
}
