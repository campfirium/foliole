import type { ExportBookContract, ReaderDocumentContract } from '../../lib/core/readwise/readwiseApiContract.js';
import { prepareReadwiseApiDocuments } from '../../lib/core/readwise/readwiseApiImport.js';
import type {
  CandidateStatus,
  ReadwiseApiCandidate,
  ReadwiseApiCandidateFailure
} from '../import/readwiseApiCandidateTypes.js';

import { openDatabaseConnection } from './connection.js';

const CANDIDATE_KIND = 'candidate-v2';
const EXPORT_KIND = 'candidate-export-v2';
const READER_KIND = 'candidate-reader-v2';

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
  saveStageRecords(connectionRef, EXPORT_KIND, books.flatMap((book) => book.externalId ? [[book.externalId, book] as const] : []));
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
      upsert.run([connectionRef, READER_KIND, document.id, JSON.stringify({ ...document, rawSourceUrl: null })]);
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
  const driver = openDatabaseConnection().driver;
  const ids = [documentId, ...candidate.highlightIds];
  const placeholders = ids.map(() => '?').join(', ');
  const readers = driver.queryAll<{ payload_json: string }>(
    `SELECT payload_json FROM readwise_api_import_stage
     WHERE connection_ref = ? AND record_kind = ? AND remote_id IN (${placeholders})`,
    [connectionRef, READER_KIND, ...ids]
  ).flatMap((row) => parseJson<ReaderDocumentContract>(row.payload_json));
  const exportRow = driver.queryOne<{ payload_json: string }>(
    `SELECT payload_json FROM readwise_api_import_stage
     WHERE connection_ref = ? AND record_kind = ? AND remote_id = ?`,
    [connectionRef, EXPORT_KIND, documentId]
  );
  const books = exportRow ? parseJson<ExportBookContract>(exportRow.payload_json) : [];
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
  openDatabaseConnection().driver.execute(
    `DELETE FROM readwise_api_import_stage
     WHERE connection_ref = ? AND record_kind != 'candidate-manifest-v2'`, [connectionRef]
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
      status: previous.status,
      title: previous.title
    };
  }
  return {
    ...previous,
    readerCategory: next.readerCategory ?? previous.readerCategory,
    title: next.title ?? previous.title
  };
}

function compareCandidates(left: ReadwiseApiCandidate, right: ReadwiseApiCandidate) {
  const priority = Number(left.exportCategory !== 'books') - Number(right.exportCategory !== 'books');
  const requestCount = left.highlightIds.length - right.highlightIds.length;
  return priority || requestCount || left.documentId.localeCompare(right.documentId);
}

function parseCandidate(value: string): ReadwiseApiCandidate | null {
  const parsed = parseJson<ReadwiseApiCandidate>(value)[0];
  return parsed?.documentId ? parsed : null;
}

function parseJson<T>(value: string): T[] {
  try { return [JSON.parse(value) as T]; } catch { return []; }
}
