import { recordImportSourceSync } from '../../lib/core/database/importPipelineRecords.js';
import { requireResolvedNodeBody, type NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';
import type { ExportBookContract, ReaderDocumentContract } from '../../lib/core/readwise/readwiseApiContract.js';
import {
  normalizeReadwiseApiDocumentImportState,
  type ReadwiseApiDocumentImportState
} from '../../lib/core/readwise/readwiseApiImportState.js';
import { normalizeRemoteAnnotationBindings } from '../../lib/core/readwise/readwiseRemoteIdentity.js';

import { openDatabaseConnection } from './connection.js';
import { loadJsonSetting, saveJsonSetting } from './settingsStore.js';

const CURSOR_STATE_KEY = 'readwise_api_import_state';

export type ReadwiseApiRunPhase = 'reader' | 'export' | 'ready';

export interface ReadwiseApiImportRunState {
  connectionRef: string;
  exportCursor: string | null;
  phase: ReadwiseApiRunPhase;
  queryUpdatedAfter: string | null;
  readerCursor: string | null;
  roundStartedAt: string;
}

interface RemoteImportSourceRow extends NodeBodyRow {
  latest_node_id: string | null;
  node_deleted_at: string | null;
  node_title: string | null;
  remote_annotations_json: string;
  remote_import_state_json: string;
  source_fingerprint: string;
}

function completedThrough(connectionRef: string) {
  const row = loadJsonSetting(CURSOR_STATE_KEY);
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const value = row as Record<string, unknown>;
  return value.connectionRef === connectionRef && typeof value.completedThrough === 'string'
    ? value.completedThrough : null;
}

export function loadOrCreateReadwiseApiImportRun(
  connectionRef: string,
  now = new Date().toISOString()
): ReadwiseApiImportRunState {
  const driver = openDatabaseConnection().driver;
  const existing = driver.queryOne<Record<string, unknown>>(
    'SELECT * FROM readwise_api_import_runs WHERE connection_ref = ?', [connectionRef]
  );
  if (existing) return toRunState(existing);
  driver.execute(
    `INSERT INTO readwise_api_import_runs (
      connection_ref, query_updated_after, round_started_at, reader_cursor, export_cursor, phase, updated_at
    ) VALUES (?, ?, ?, NULL, NULL, 'reader', ?)`,
    [connectionRef, completedThrough(connectionRef), now, now]
  );
  return loadOrCreateReadwiseApiImportRun(connectionRef, now);
}

export function saveReadwiseApiStagePage(input: {
  connectionRef: string;
  cursor: string | null;
  items: Array<ExportBookContract | ReaderDocumentContract>;
  kind: 'export' | 'reader';
  now?: string;
}) {
  const driver = openDatabaseConnection().driver;
  const now = input.now ?? new Date().toISOString();
  driver.transaction((tx) => {
    const insert = tx.prepare(
      `INSERT INTO readwise_api_import_stage (connection_ref, record_kind, remote_id, payload_json)
       VALUES (?, ?, ?, ?) ON CONFLICT(connection_ref, record_kind, remote_id)
       DO UPDATE SET payload_json = excluded.payload_json`
    );
    for (const item of input.items) {
      const remoteId = input.kind === 'reader' ? (item as ReaderDocumentContract).id : exportStageId(item as ExportBookContract);
      insert.run([input.connectionRef, input.kind, remoteId, JSON.stringify(withoutRawSourceUrl(item))]);
    }
    const nextPhase: ReadwiseApiRunPhase = input.cursor ? input.kind : input.kind === 'reader' ? 'export' : 'ready';
    tx.execute(
      `UPDATE readwise_api_import_runs SET reader_cursor = ?, export_cursor = ?, phase = ?, updated_at = ?
       WHERE connection_ref = ?`,
      [input.kind === 'reader' ? input.cursor : null, input.kind === 'export' ? input.cursor : null,
        nextPhase, now, input.connectionRef]
    );
  });
}

export function loadStagedReadwiseApiContracts(connectionRef: string) {
  const rows = openDatabaseConnection().driver.queryAll<{ payload_json: string; record_kind: string }>(
    `SELECT record_kind, payload_json FROM readwise_api_import_stage
     WHERE connection_ref = ? ORDER BY record_kind, remote_id`, [connectionRef]
  );
  const readerDocuments: ReaderDocumentContract[] = [];
  const exportBooks: ExportBookContract[] = [];
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.payload_json);
      if (row.record_kind === 'reader') readerDocuments.push(parsed as ReaderDocumentContract);
      if (row.record_kind === 'export') exportBooks.push(parsed as ExportBookContract);
    } catch { /* corrupted staging is reset by the caller */ }
  }
  return { exportBooks, readerDocuments };
}

export function resetReadwiseApiImportRun(connectionRef: string, now = new Date().toISOString()) {
  const driver = openDatabaseConnection().driver;
  driver.transaction((tx) => {
    tx.execute('DELETE FROM readwise_api_import_stage WHERE connection_ref = ?', [connectionRef]);
    tx.execute(
      `UPDATE readwise_api_import_runs SET reader_cursor = NULL, export_cursor = NULL, phase = 'reader', updated_at = ?
       WHERE connection_ref = ?`, [now, connectionRef]
    );
  });
}

export function completeReadwiseApiImportRun(run: ReadwiseApiImportRunState, now = new Date().toISOString()) {
  const driver = openDatabaseConnection().driver;
  driver.transaction((tx) => {
    tx.execute('DELETE FROM readwise_api_import_stage WHERE connection_ref = ?', [run.connectionRef]);
    tx.execute('DELETE FROM readwise_api_import_runs WHERE connection_ref = ?', [run.connectionRef]);
  });
  saveJsonSetting(CURSOR_STATE_KEY, {
    completedThrough: overlapBoundary(run.roundStartedAt),
    connectionRef: run.connectionRef,
    updatedAt: now,
    version: 1
  }, now);
}

export function loadVerifiedReadwiseHighlightIds(connectionRef: string) {
  const rows = openDatabaseConnection().driver.queryAll<{ remote_annotations_json: string }>(
    `SELECT remote_annotations_json FROM import_sources
     WHERE remote_provider = 'readwise' AND remote_connection_ref = ?`, [connectionRef]
  );
  return new Set(rows.flatMap((row) => normalizeRemoteAnnotationBindings(parseJson(row.remote_annotations_json)))
    .filter((binding) => binding.kind === 'highlight')
    .map((binding) => binding.remoteId));
}

export function loadReadwiseApiImportSource(connectionRef: string, documentId: string) {
  const row = openDatabaseConnection().driver.queryOne<RemoteImportSourceRow>(
    `SELECT i.source_fingerprint, i.latest_node_id, i.remote_annotations_json, i.remote_import_state_json,
       n.title node_title, n.content, n.body_blob_hash, cbd.data body_blob_data, n.deleted_at node_deleted_at
     FROM import_sources i LEFT JOIN nodes n ON n.id = i.latest_node_id
     LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
     WHERE i.remote_provider = 'readwise' AND i.remote_connection_ref = ? AND i.remote_document_id = ?`,
    [connectionRef, documentId]
  );
  if (!row) return null;
  let parsed: unknown = null;
  try { parsed = JSON.parse(row.remote_import_state_json); } catch { /* defaults below */ }
  return {
    annotations: normalizeRemoteAnnotationBindings(parseJson(row.remote_annotations_json)),
    body: row.latest_node_id && !row.node_deleted_at ? requireResolvedNodeBody(row, row.latest_node_id).content : null,
    nodeDeleted: Boolean(row.latest_node_id && row.node_deleted_at),
    nodeId: row.latest_node_id,
    sourceFingerprint: row.source_fingerprint,
    state: normalizeReadwiseApiDocumentImportState(parsed),
    title: row.node_title
  };
}

export function saveReadwiseApiImportSource(input: {
  annotationsJson: string;
  connectionRef: string;
  documentId: string;
  sourceFingerprint: string;
  state: ReadwiseApiDocumentImportState;
  updatedAt: string;
}) {
  const driver = openDatabaseConnection().driver;
  driver.transaction((tx) => {
    const result = tx.execute(
      `UPDATE import_sources SET remote_provider = 'readwise', remote_connection_ref = ?, remote_document_id = ?,
       remote_annotations_json = ?, remote_import_state_json = ? WHERE source_fingerprint = ?`,
      [input.connectionRef, input.documentId, input.annotationsJson, JSON.stringify(input.state), input.sourceFingerprint]
    );
    if (result.changes !== 1) throw new Error('readwise_api_import_source_missing');
    recordImportSourceSync(tx, input.sourceFingerprint, input.updatedAt);
  });
}

function toRunState(row: Record<string, unknown>): ReadwiseApiImportRunState {
  return {
    connectionRef: String(row.connection_ref),
    exportCursor: typeof row.export_cursor === 'string' ? row.export_cursor : null,
    phase: row.phase === 'export' || row.phase === 'ready' ? row.phase : 'reader',
    queryUpdatedAfter: typeof row.query_updated_after === 'string' ? row.query_updated_after : null,
    readerCursor: typeof row.reader_cursor === 'string' ? row.reader_cursor : null,
    roundStartedAt: String(row.round_started_at)
  };
}

function exportStageId(book: ExportBookContract) {
  return book.externalId ?? `unmapped:${book.highlightExternalIds.join(':')}`;
}

function withoutRawSourceUrl(item: ExportBookContract | ReaderDocumentContract) {
  return 'rawSourceUrl' in item ? { ...item, rawSourceUrl: null } : item;
}

function parseJson(value: string) {
  try { return JSON.parse(value); } catch { return null; }
}

function overlapBoundary(timestamp: string) {
  const value = Date.parse(timestamp);
  return Number.isFinite(value) ? new Date(value - 60_000).toISOString() : timestamp;
}
