import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import type {
  ExportBookContract,
  ReaderDocumentContract
} from '../../lib/core/readwise/readwiseApiContract.js';
import type { ReadwiseApiIndexScope } from '../import/readwiseApiCandidateTypes.js';

import { openDatabaseConnection } from './connection.js';

export const INDEX_EXPORT_KIND = 'candidate-export-v3';
export const INDEX_READER_KIND = 'candidate-reader-v3';
const TAG_REPLAY_KIND = 'candidate-tag-replay-v3';
const CATEGORY_TAG_KIND = 'candidate-category-tag-v3';
export const ANNOTATION_LEDGER_KIND = 'readwise-annotation-ledger-v3';

export interface ReadwiseAnnotationLedgerFact {
  category: 'highlight' | 'note';
  contentStatus: 'available' | 'unavailable' | 'unknown';
  documentId: string | null;
  resolution?: 'resolved' | 'parent-and-content-unavailable' | 'article-parent-unavailable';
  resolutionRun?: string;
  parentId: string | null;
  remoteId: string;
  seenInRun: string;
  updatedAt: string | null;
}

export function saveReadwiseApiReaderIndexPage(
  connectionRef: string,
  documents: ReaderDocumentContract[],
  seenInRun = ''
) {
  const driver = openDatabaseConnection().driver;
  driver.transaction((tx) => {
    const upsert = tx.prepare(upsertSql());
    for (const document of documents) {
      upsert.run([
        connectionRef,
        INDEX_READER_KIND,
        document.id,
        JSON.stringify({
          ...document,
          rawSourceUrl: document.rawSourceUrl
        })
      ]);
      if (document.category === 'highlight' || document.category === 'note') {
        const previous = loadAnnotationLedgerFact(connectionRef, document.id);
        upsert.run([connectionRef, ANNOTATION_LEDGER_KIND, document.id, JSON.stringify({
          category: document.category,
          contentStatus: previous?.contentStatus ?? 'unknown',
          documentId: previous?.documentId ?? null,
          ...(previous?.resolution ? { resolution: previous.resolution } : {}),
          ...(previous?.resolutionRun ? { resolutionRun: previous.resolutionRun } : {}),
          parentId: document.parentId,
          remoteId: document.id,
          seenInRun,
          updatedAt: document.updatedAt
        } satisfies ReadwiseAnnotationLedgerFact)]);
      }
    }
  });
}

export function saveReadwiseApiAnnotationContentStates(
  connectionRef: string,
  availableIds: ReadonlySet<string>,
  seenInRun: string
) {
  const driver = openDatabaseConnection().driver;
  const facts = loadReadwiseApiAnnotationLedger(connectionRef);
  driver.transaction((tx) => {
    const update = tx.prepare(
      `UPDATE readwise_api_import_stage SET payload_json = ?
       WHERE connection_ref = ? AND record_kind = ? AND remote_id = ?`
    );
    for (const fact of facts.filter((item) => item.category === 'highlight')) {
      const contentStatus = availableIds.has(fact.remoteId)
        ? 'available' : fact.seenInRun === seenInRun ? 'unavailable' : fact.contentStatus;
      update.run([JSON.stringify({ ...fact, contentStatus }),
        connectionRef, ANNOTATION_LEDGER_KIND, fact.remoteId]);
    }
  });
}

export function saveReadwiseApiExportIndexPage(connectionRef: string, books: ExportBookContract[]) {
  const driver = openDatabaseConnection().driver;
  driver.transaction((tx) => {
    const upsert = tx.prepare(upsertSql());
    for (const book of books) {
      if (book.source !== 'reader' || !book.externalId) continue;
      const previous = loadExportBook(connectionRef, book.externalId);
      upsert.run([connectionRef, INDEX_EXPORT_KIND, book.externalId, JSON.stringify(
        previous ? mergeExportBook(previous, book) : book
      )]);
    }
  });
}

export function loadReadwiseApiReaderIndex(connectionRef: string, remoteIds?: readonly string[]) {
  return loadKind<ReaderDocumentContract>(connectionRef, INDEX_READER_KIND, remoteIds);
}

export function loadReadwiseApiExportIndex(connectionRef: string, remoteIds?: readonly string[]) {
  return loadKind<ExportBookContract>(connectionRef, INDEX_EXPORT_KIND, remoteIds);
}

export function loadReadwiseApiAnnotationLedger(connectionRef: string) {
  return loadKind<ReadwiseAnnotationLedgerFact>(connectionRef, ANNOTATION_LEDGER_KIND);
}

export function countReadwiseApiIndexedRecords(connectionRef: string) {
  return openDatabaseConnection().driver.queryOne<{ count: number }>(
    `SELECT COUNT(DISTINCT remote_id) count FROM readwise_api_import_stage
     WHERE connection_ref = ? AND record_kind IN (?, ?)`,
    [connectionRef, INDEX_READER_KIND, INDEX_EXPORT_KIND]
  )?.count ?? 0;
}

export function loadReadwiseApiAnnotationLedgerDocuments(
  connectionRef: string,
  documentId: string,
  remoteIds: readonly string[]
): ReaderDocumentContract[] {
  const facts = loadKind<ReadwiseAnnotationLedgerFact>(connectionRef, ANNOTATION_LEDGER_KIND, remoteIds);
  const knownIds = new Set(remoteIds);
  // Older manifests can include a note without listing its parent highlight.
  const parentIds = [...new Set(facts.flatMap(item =>
    item.category === 'note' && item.parentId && !knownIds.has(item.parentId) ? [item.parentId] : []))];
  const parents = parentIds.length
    ? loadKind<ReadwiseAnnotationLedgerFact>(connectionRef, ANNOTATION_LEDGER_KIND, parentIds) : [];
  const belongsToDocument = (item: ReadwiseAnnotationLedgerFact) =>
    item.category === 'highlight' && (item.parentId === documentId || item.documentId === documentId);
  const highlights = facts.filter(belongsToDocument);
  const highlightIds = new Set([...highlights, ...parents.filter(belongsToDocument)].map(item => item.remoteId));
  const notes = facts.filter((item) => item.category === 'note' && item.parentId && highlightIds.has(item.parentId));
  return [...highlights, ...notes].map(normalizeLedgerDocument);
}

export function saveReadwiseApiTagMatches(
  driver: DatabaseDriver, connectionRef: string, scope: ReadwiseApiIndexScope, documentIds: string[]
) {
  const kind = scope === 'reader:tag' ? TAG_REPLAY_KIND : CATEGORY_TAG_KIND;
  const insert = driver.prepare(upsertSql());
  const evidence = JSON.stringify(scope);
  for (const documentId of documentIds) insert.run([connectionRef, kind, documentId, evidence]);
}

export function loadReadwiseApiTagMatchesAfterReplay(connectionRef: string) {
  const rows = openDatabaseConnection().driver.queryAll<{ remote_id: string }>(
    'SELECT remote_id FROM readwise_api_import_stage WHERE connection_ref = ? AND record_kind IN (?, ?)',
    [connectionRef, TAG_REPLAY_KIND, CATEGORY_TAG_KIND]
  );
  return new Set(rows.map(row => row.remote_id));
}

export function clearReadwiseApiScopeTagMatches(driver: DatabaseDriver, connectionRef: string, scope: ReadwiseApiIndexScope) {
  driver.execute(`DELETE FROM readwise_api_import_stage WHERE connection_ref = ? AND record_kind = ?
    AND (? IS NULL OR payload_json = ?)`, scope === 'reader:tag'
    ? [connectionRef, TAG_REPLAY_KIND, null, null]
    : [connectionRef, CATEGORY_TAG_KIND, JSON.stringify(scope), JSON.stringify(scope)]);
}

export function clearReadwiseApiTransientIndex(connectionRef: string) {
  openDatabaseConnection().driver.execute(
    `DELETE FROM readwise_api_import_stage
     WHERE connection_ref = ? AND record_kind IN (?, ?, ?, ?)`,
    [connectionRef, INDEX_READER_KIND, INDEX_EXPORT_KIND, TAG_REPLAY_KIND, CATEGORY_TAG_KIND]
  );
}

function loadAnnotationLedgerFact(connectionRef: string, remoteId: string) {
  const row = openDatabaseConnection().driver.queryOne<{ payload_json: string }>(
    `SELECT payload_json FROM readwise_api_import_stage
     WHERE connection_ref = ? AND record_kind = ? AND remote_id = ?`,
    [connectionRef, ANNOTATION_LEDGER_KIND, remoteId]
  );
  return row ? parse<ReadwiseAnnotationLedgerFact>(row.payload_json) : null;
}

function loadExportBook(connectionRef: string, documentId: string) {
  const row = openDatabaseConnection().driver.queryOne<{ payload_json: string }>(
    `SELECT payload_json FROM readwise_api_import_stage
     WHERE connection_ref = ? AND record_kind = ? AND remote_id = ?`,
    [connectionRef, INDEX_EXPORT_KIND, documentId]
  );
  return row ? parse<ExportBookContract>(row.payload_json) : null;
}

function loadKind<T>(connectionRef: string, kind: string, remoteIds?: readonly string[]) {
  const exactIds = 'AND remote_id IN (SELECT value FROM json_each(?)) ORDER BY remote_id';
  return openDatabaseConnection().driver.queryAll<{ payload_json: string }>(
    `SELECT payload_json FROM readwise_api_import_stage
     WHERE connection_ref = ? AND record_kind = ? ${remoteIds ? exactIds : ''}`,
    remoteIds ? [connectionRef, kind, JSON.stringify(remoteIds)] : [connectionRef, kind]
  ).flatMap((row) => {
    const parsed = parse<T>(row.payload_json);
    return parsed ? [parsed] : [];
  });
}

function mergeExportBook(previous: ExportBookContract, next: ExportBookContract): ExportBookContract {
  const highlights = new Map(previous.highlights.map((item) => [item.externalId, item]));
  for (const item of next.highlights) highlights.set(item.externalId, item);
  return {
    ...previous,
    ...next,
    highlightExternalIds: [...highlights.keys()],
    highlights: [...highlights.values()],
    isDeleted: false
  };
}

function normalizeLedgerDocument(fact: ReadwiseAnnotationLedgerFact): ReaderDocumentContract {
  return {
    author: null,
    category: fact.category,
    htmlContent: null,
    id: fact.remoteId,
    imageUrl: null,
    notes: null,
    parentId: fact.parentId,
    rawSourceUrl: null,
    sourceUrl: null,
    summary: null,
    title: null,
    updatedAt: fact.updatedAt,
    url: null
  };
}

function upsertSql() {
  return `INSERT INTO readwise_api_import_stage (connection_ref, record_kind, remote_id, payload_json)
    VALUES (?, ?, ?, ?) ON CONFLICT(connection_ref, record_kind, remote_id)
    DO UPDATE SET payload_json = excluded.payload_json`;
}

function parse<T>(value: string): T | null {
  try { return JSON.parse(value) as T; } catch { return null; }
}
