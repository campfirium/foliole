import type { ExportBookContract, ReaderDocumentContract } from '../../lib/core/readwise/readwiseApiContract.js';
import { prepareReadwiseApiDocuments } from '../../lib/core/readwise/readwiseApiImport.js';
import {
  READWISE_API_PIPELINE_VERSION,
  type CandidateStatus,
  type ReadwiseApiCandidate,
  type ReadwiseApiCandidateFailure,
  type ReadwiseApiCandidateManifest
} from '../import/readwiseApiCandidateTypes.js';

import { openDatabaseConnection } from './connection.js';
import {
  clearReadwiseApiTransientIndex,
  loadReadwiseApiAnnotationLedgerDocuments,
  loadReadwiseApiExportIndex,
  loadReadwiseApiReaderIndex
} from './readwiseApiIndexStage.js';
import { finalizeReadwiseApiScopeLedgers } from './readwiseApiScopeLedger.js';

const CANDIDATE_KIND = 'candidate-v3';

export function saveReadwiseApiCandidateManifest(connectionRef: string, scopeSignature: string) {
  openDatabaseConnection().driver.execute(
    `UPDATE readwise_api_import_stage SET payload_json = ?
     WHERE connection_ref = ? AND record_kind = 'candidate-manifest-v3' AND remote_id = 'manifest'`,
    [JSON.stringify({
      pipelineVersion: READWISE_API_PIPELINE_VERSION,
      scopeSignature
    } satisfies ReadwiseApiCandidateManifest), connectionRef]
  );
}

export function saveReadwiseApiCandidates(connectionRef: string, candidates: ReadwiseApiCandidate[]) {
  const driver = openDatabaseConnection().driver;
  driver.transaction((tx) => {
    const select = tx.prepare(
      'SELECT payload_json FROM readwise_api_import_stage WHERE connection_ref = ? AND record_kind = ? AND remote_id = ?'
    );
    const upsert = tx.prepare(
      `INSERT INTO readwise_api_import_stage (connection_ref, record_kind, remote_id, payload_json)
       VALUES (?, ?, ?, ?) ON CONFLICT(connection_ref, record_kind, remote_id)
       DO UPDATE SET payload_json = excluded.payload_json`
    );
    for (const candidate of candidates) {
      const row = select.get([connectionRef, CANDIDATE_KIND, candidate.documentId]) as { payload_json?: string } | undefined;
      const previous = row?.payload_json ? parseCandidate(row.payload_json) : null;
      upsert.run([connectionRef, CANDIDATE_KIND, candidate.documentId,
        JSON.stringify(previous ? mergeCandidate(previous, candidate) : candidate)]);
    }
  });
}

export function saveReadwiseApiCandidateExportPage(connectionRef: string, books: ExportBookContract[]) {
  saveStageRecords(connectionRef, 'candidate-export-v3', books.flatMap((book) =>
    book.externalId ? [[book.externalId, book] as const] : []));
}

export function saveReadwiseApiCandidateFacts(
  connectionRef: string,
  documentId: string,
  documents: ReaderDocumentContract[]
) {
  const driver = openDatabaseConnection().driver;
  driver.transaction((tx) => {
    const upsert = tx.prepare(
      `INSERT INTO readwise_api_import_stage (connection_ref, record_kind, remote_id, payload_json)
       VALUES (?, ?, ?, ?) ON CONFLICT(connection_ref, record_kind, remote_id)
       DO UPDATE SET payload_json = excluded.payload_json`
    );
    for (const document of documents) {
      upsert.run([connectionRef, 'candidate-reader-v3', document.id,
        JSON.stringify({ ...document, rawSourceUrl: null })]);
    }
    updateStatus(tx, connectionRef, documentId, 'ready');
  });
}

export function loadReadwiseApiCandidates(connectionRef: string) {
  return openDatabaseConnection().driver.queryAll<{ payload_json: string }>(
    `SELECT payload_json FROM readwise_api_import_stage
     WHERE connection_ref = ? AND record_kind = ?`, [connectionRef, CANDIDATE_KIND]
  ).flatMap((row) => {
    const candidate = parseCandidate(row.payload_json);
    return candidate ? [candidate] : [];
  }).sort(compareCandidates);
}

export function loadReadwiseApiCandidateProgress(connectionRef: string) {
  const candidates = loadReadwiseApiCandidates(connectionRef);
  const completedCount = candidates.filter((candidate) => candidate.status === 'completed').length;
  const failedCount = candidates.filter((candidate) => candidate.status === 'failed').length;
  const unexplainedFailureCount = candidates.filter((candidate) =>
    candidate.status === 'failed' && !candidate.failure?.reason).length;
  return {
    completedCount,
    failedCount,
    pendingCount: candidates.length - completedCount - failedCount,
    totalCount: candidates.length,
    unexplainedFailureCount
  };
}

export function loadPreparedReadwiseApiCandidate(connectionRef: string, documentId: string) {
  const candidate = loadReadwiseApiCandidate(documentId, connectionRef);
  if (!candidate) return null;
  const ids = new Set([documentId, ...candidate.highlightIds, ...(candidate.noteIds ?? [])]);
  const indexed = loadReadwiseApiReaderIndex(connectionRef).filter((item) => ids.has(item.id));
  const byId = new Map(indexed.map((item) => [item.id, item]));
  for (const item of loadReadwiseApiAnnotationLedgerDocuments(connectionRef, documentId)) {
    if (ids.has(item.id) && !byId.has(item.id)) byId.set(item.id, item);
  }
  const readers = [...byId.values()];
  const books = loadReadwiseApiExportIndex(connectionRef).filter((item) => item.externalId === documentId);
  return prepareReadwiseApiDocuments(readers, books)[0] ?? null;
}

export function setReadwiseApiCandidateStatus(
  connectionRef: string,
  documentId: string,
  status: CandidateStatus,
  failure?: Omit<ReadwiseApiCandidateFailure, 'attemptCount'> | null
) {
  updateStatus(openDatabaseConnection().driver, connectionRef, documentId, status, failure);
}

export function clearReadwiseApiCandidateStage(connectionRef: string) {
  finalizeReadwiseApiScopeLedgers(connectionRef);
  clearReadwiseApiTransientIndex(connectionRef);
  openDatabaseConnection().driver.execute(
    `DELETE FROM readwise_api_import_stage
     WHERE connection_ref = ? AND record_kind = ?`, [connectionRef, CANDIDATE_KIND]
  );
}

function loadReadwiseApiCandidate(documentId: string, connectionRef: string) {
  const row = openDatabaseConnection().driver.queryOne<{ payload_json: string }>(
    `SELECT payload_json FROM readwise_api_import_stage
     WHERE connection_ref = ? AND record_kind = ? AND remote_id = ?`,
    [connectionRef, CANDIDATE_KIND, documentId]
  );
  return row ? parseCandidate(row.payload_json) : null;
}

function updateStatus(
  driver: ReturnType<typeof openDatabaseConnection>['driver'],
  connectionRef: string,
  documentId: string,
  status: CandidateStatus,
  failure?: Omit<ReadwiseApiCandidateFailure, 'attemptCount'> | null
) {
  const row = driver.queryOne<{ payload_json: string }>(
    `SELECT payload_json FROM readwise_api_import_stage
     WHERE connection_ref = ? AND record_kind = ? AND remote_id = ?`,
    [connectionRef, CANDIDATE_KIND, documentId]
  );
  const candidate = row ? parseCandidate(row.payload_json) : null;
  if (!candidate) throw new Error('readwise_api_candidate_missing');
  const nextFailure = failure === undefined
    ? candidate.failure
    : failure === null ? undefined : {
      ...failure,
      attemptCount: (candidate.failure?.attemptCount ?? 0) + 1
    };
  driver.execute(
    `UPDATE readwise_api_import_stage SET payload_json = ?
     WHERE connection_ref = ? AND record_kind = ? AND remote_id = ?`,
    [JSON.stringify({ ...candidate, failure: nextFailure, status }), connectionRef, CANDIDATE_KIND, documentId]
  );
}

function saveStageRecords<T>(connectionRef: string, kind: string, records: Array<readonly [string, T]>) {
  const driver = openDatabaseConnection().driver;
  const statement = driver.prepare(
    `INSERT INTO readwise_api_import_stage (connection_ref, record_kind, remote_id, payload_json)
     VALUES (?, ?, ?, ?) ON CONFLICT(connection_ref, record_kind, remote_id)
     DO UPDATE SET payload_json = excluded.payload_json`
  );
  driver.transaction(() => {
    for (const [id, value] of records) statement.run([connectionRef, kind, id, JSON.stringify(value)]);
  });
}

function mergeCandidate(previous: ReadwiseApiCandidate, next: ReadwiseApiCandidate): ReadwiseApiCandidate {
  if (!previous.hasHighlights && next.hasHighlights) {
    return {
      ...next,
      ...(previous.failure ? { failure: previous.failure } : {}),
      readerCategory: previous.readerCategory,
      noteIds: unique([...(previous.noteIds ?? []), ...(next.noteIds ?? [])]),
      highlightIds: unique([...previous.highlightIds, ...next.highlightIds]),
      matchedImportTag: previous.matchedImportTag === true || next.matchedImportTag === true,
      status: previous.status,
      title: previous.title
    };
  }
  return {
    ...previous,
    highlightIds: unique([...previous.highlightIds, ...next.highlightIds]),
    noteIds: unique([...(previous.noteIds ?? []), ...(next.noteIds ?? [])]),
    matchedImportTag: previous.matchedImportTag === true || next.matchedImportTag === true,
    readerCategory: next.readerCategory ?? previous.readerCategory,
    title: next.title ?? previous.title
  };
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function compareCandidates(left: ReadwiseApiCandidate, right: ReadwiseApiCandidate) {
  const priority = Number(left.readerCategory !== 'epub') - Number(right.readerCategory !== 'epub');
  const requestCount = left.highlightIds.length - right.highlightIds.length;
  return priority || requestCount || left.documentId.localeCompare(right.documentId);
}

function parseCandidate(value: string): ReadwiseApiCandidate | null {
  const parsed = parseJson<ReadwiseApiCandidate>(value)[0];
  return parsed?.documentId ? { ...parsed, matchedImportTag: parsed.matchedImportTag === true } : null;
}

function parseJson<T>(value: string): T[] {
  try { return [JSON.parse(value) as T]; } catch { return []; }
}
