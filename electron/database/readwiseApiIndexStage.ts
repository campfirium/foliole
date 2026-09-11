import type {
  ExportBookContract,
  ReaderDocumentContract
} from '../../lib/core/readwise/readwiseApiContract.js';

import { openDatabaseConnection } from './connection.js';

export const INDEX_EXPORT_KIND = 'candidate-export-v3';
export const INDEX_READER_KIND = 'candidate-reader-v3';
export const ANNOTATION_LEDGER_KIND = 'readwise-annotation-ledger-v3';

export interface ReadwiseAnnotationLedgerFact {
  category: 'highlight' | 'note';
  contentStatus: 'available' | 'unavailable' | 'unknown';
  documentId: string | null;
  parentId: string | null;
  remoteId: string;
  seenInRun: string;
  updatedAt: string | null;
}

export interface ReadwiseApiIndexedReaderDocument extends ReaderDocumentContract {
  matchedImportTag?: string | null;
}

export function saveReadwiseApiReaderIndexPage(
  connectionRef: string,
  documents: ReaderDocumentContract[],
  seenInRun = '',
  matchedImportTag: string | null = null
) {
  const driver = openDatabaseConnection().driver;
  driver.transaction((tx) => {
    const upsert = tx.prepare(upsertSql());
    for (const document of documents) {
      const previous = loadReaderDocument(connectionRef, document.id);
      upsert.run([
        connectionRef,
        INDEX_READER_KIND,
        document.id,
        JSON.stringify({
          ...document,
          matchedImportTag: matchedImportTag ?? previous?.matchedImportTag ?? null,
          rawSourceUrl: null
        })
      ]);
      if (document.category === 'highlight' || document.category === 'note') {
        const previous = loadAnnotationLedgerFact(connectionRef, document.id);
        upsert.run([connectionRef, ANNOTATION_LEDGER_KIND, document.id, JSON.stringify({
          category: document.category,
          contentStatus: previous?.contentStatus ?? 'unknown',
          documentId: previous?.documentId ?? null,
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

export function bindReadwiseApiAnnotationParents(
  connectionRef: string,
  documentId: string,
  annotationIds: readonly string[]
) {
  const driver = openDatabaseConnection().driver;
  driver.transaction((tx) => {
    const update = tx.prepare(
      `UPDATE readwise_api_import_stage SET payload_json = ?
       WHERE connection_ref = ? AND record_kind = ? AND remote_id = ?`
    );
    for (const remoteId of annotationIds) {
      const current = loadAnnotationLedgerFact(connectionRef, remoteId);
      if (current) update.run([JSON.stringify({ ...current, documentId }),
        connectionRef, ANNOTATION_LEDGER_KIND, remoteId]);
    }
  });
}

export function loadReadwiseApiReaderIndex(connectionRef: string) {
  return loadKind<ReadwiseApiIndexedReaderDocument>(connectionRef, INDEX_READER_KIND);
}

export function loadReadwiseApiExportIndex(connectionRef: string) {
  return loadKind<ExportBookContract>(connectionRef, INDEX_EXPORT_KIND);
}

export function loadReadwiseApiAnnotationLedger(connectionRef: string) {
  return loadKind<ReadwiseAnnotationLedgerFact>(connectionRef, ANNOTATION_LEDGER_KIND);
}

export function loadReadwiseApiAnnotationLedgerDocuments(
  connectionRef: string,
  documentId: string
): ReaderDocumentContract[] {
  const facts = loadReadwiseApiAnnotationLedger(connectionRef);
  const highlights = facts.filter((item) =>
    item.category === 'highlight' && (item.parentId === documentId || item.documentId === documentId));
  const highlightIds = new Set(highlights.map((item) => item.remoteId));
  const notes = facts.filter((item) => item.category === 'note' && item.parentId && highlightIds.has(item.parentId));
  return [...highlights, ...notes].map((item) => normalizeLedgerDocument(item));
}

export function clearReadwiseApiTransientIndex(connectionRef: string) {
  openDatabaseConnection().driver.execute(
    `DELETE FROM readwise_api_import_stage
     WHERE connection_ref = ? AND record_kind IN (?, ?)`,
    [connectionRef, INDEX_READER_KIND, INDEX_EXPORT_KIND]
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

function loadReaderDocument(connectionRef: string, documentId: string) {
  const row = openDatabaseConnection().driver.queryOne<{ payload_json: string }>(
    `SELECT payload_json FROM readwise_api_import_stage
     WHERE connection_ref = ? AND record_kind = ? AND remote_id = ?`,
    [connectionRef, INDEX_READER_KIND, documentId]
  );
  return row ? parse<ReadwiseApiIndexedReaderDocument>(row.payload_json) : null;
}

function loadKind<T>(connectionRef: string, kind: string) {
  return openDatabaseConnection().driver.queryAll<{ payload_json: string }>(
    `SELECT payload_json FROM readwise_api_import_stage
     WHERE connection_ref = ? AND record_kind = ?`,
    [connectionRef, kind]
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
