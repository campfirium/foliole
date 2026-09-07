import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import { recordImportSourceSync } from '../../lib/core/database/importPipelineRecords.js';
import { normalizeReadwiseApiDocumentImportState } from '../../lib/core/readwise/readwiseApiImportState.js';
import type {
  ReadwiseReconcileExportBook,
  ReadwiseReconcileScope
} from '../../lib/core/readwise/readwiseRemoteLifecycle.js';

import { openDatabaseConnection } from './connection.js';

export interface ReadwiseApiReconcileRunState {
  connectionRef: string;
  exportCursor: string | null;
  phase: 'export' | 'reader' | 'ready';
  readerCursor: string | null;
  scope: ReadwiseReconcileScope;
  startedAt: string;
}

interface ImportSourceLifecycleRow extends DatabaseRow {
  remote_document_id: string;
  remote_import_state_json: string;
  source_fingerprint: string;
}

export function loadOrCreateReadwiseApiReconcileRun(
  connectionRef: string,
  scope: ReadwiseReconcileScope,
  now = new Date().toISOString()
) {
  const driver = openDatabaseConnection().driver;
  const existing = driver.queryOne<Record<string, unknown>>(
    'SELECT * FROM readwise_api_reconcile_runs WHERE connection_ref = ?', [connectionRef]
  );
  if (existing && existing.scope_json === JSON.stringify(scope)) return toRunState(existing);
  driver.transaction((tx) => {
    tx.execute('DELETE FROM readwise_api_reconcile_stage WHERE connection_ref = ?', [connectionRef]);
    tx.execute('DELETE FROM readwise_api_reconcile_runs WHERE connection_ref = ?', [connectionRef]);
    tx.execute(
      `INSERT INTO readwise_api_reconcile_runs (
        connection_ref, scope_json, started_at, reader_cursor, export_cursor, phase, updated_at
      ) VALUES (?, ?, ?, NULL, NULL, 'reader', ?)`,
      [connectionRef, JSON.stringify(scope), now, now]
    );
    markReadwiseLifecycleUnconfirmed(tx, connectionRef, scope, now);
  });
  return loadReadwiseApiReconcileRun(connectionRef)!;
}

export function loadReadwiseApiReconcileRun(connectionRef: string) {
  const row = openDatabaseConnection().driver.queryOne<Record<string, unknown>>(
    'SELECT * FROM readwise_api_reconcile_runs WHERE connection_ref = ?', [connectionRef]
  );
  return row ? toRunState(row) : null;
}

export function saveReadwiseApiReconcilePage(input: {
  connectionRef: string;
  cursor: string | null;
  items: Array<ReadwiseReconcileExportBook | { category: string | null; id: string }>;
  kind: 'export' | 'reader';
  now?: string;
}) {
  const driver = openDatabaseConnection().driver;
  const now = input.now ?? new Date().toISOString();
  driver.transaction((tx) => {
    const statement = tx.prepare(
      `INSERT INTO readwise_api_reconcile_stage (connection_ref, record_kind, remote_id, payload_json)
       VALUES (?, ?, ?, ?) ON CONFLICT(connection_ref, record_kind, remote_id)
       DO UPDATE SET payload_json = excluded.payload_json`
    );
    for (const item of input.items) {
      statement.run([input.connectionRef, input.kind, remoteId(item), JSON.stringify(item)]);
    }
    const phase = input.cursor ? input.kind : input.kind === 'reader' ? 'export' : 'ready';
    tx.execute(
      `UPDATE readwise_api_reconcile_runs SET reader_cursor = ?, export_cursor = ?, phase = ?, updated_at = ?
       WHERE connection_ref = ?`,
      [input.kind === 'reader' ? input.cursor : null, input.kind === 'export' ? input.cursor : null,
        phase, now, input.connectionRef]
    );
  });
}

export function loadReadwiseApiReconcileStage(connectionRef: string) {
  const rows = openDatabaseConnection().driver.queryAll<{ payload_json: string; record_kind: string }>(
    `SELECT record_kind, payload_json FROM readwise_api_reconcile_stage
     WHERE connection_ref = ? ORDER BY record_kind, remote_id`, [connectionRef]
  );
  const reader: Array<{ category: string | null; id: string }> = [];
  const exported: ReadwiseReconcileExportBook[] = [];
  for (const row of rows) {
    try {
      const value = JSON.parse(row.payload_json);
      if (row.record_kind === 'reader') reader.push(value);
      if (row.record_kind === 'export') exported.push(value);
    } catch { /* a malformed stage remains incomplete */ }
  }
  return { exported, reader };
}

export function completeReadwiseApiReconcileRun(run: ReadwiseApiReconcileRunState, now = new Date().toISOString()) {
  if (run.phase !== 'ready') throw new Error('readwise_reconcile_incomplete');
  const driver = openDatabaseConnection().driver;
  const stage = loadReadwiseApiReconcileStage(run.connectionRef);
  const readerIds = new Set(stage.reader.filter((item) => item.category !== 'highlight' && item.category !== 'note')
    .map((item) => item.id));
  const readerItemIds = new Set(stage.reader.map((item) => item.id));
  const exportByDocument = new Map(stage.exported.filter((item) => item.source === 'reader')
    .map((item) => [item.externalId, item]));
  const exportHighlights = new Map(stage.exported.flatMap((book) => book.source === 'reader' ? book.highlights : [])
    .map((item) => [item.externalId, item]));
  let presentCount = 0;
  let readerMissingCount = 0;
  let exportDeletedCount = 0;
  let unconfirmedCount = 0;
  driver.transaction((tx) => {
    for (const row of loadLifecycleRows(tx, run.connectionRef)) {
      const reader = readerIds.has(row.remote_document_id) ? 'present'
        : run.scope.readerLocation === 'all' ? 'missing' : 'unconfirmed';
      const exported = exportByDocument.get(row.remote_document_id);
      const exportFact = exported ? exported.isDeleted ? 'deleted' : 'present' : 'unconfirmed';
      const state = normalizeReadwiseApiDocumentImportState(parseJson(row.remote_import_state_json));
      state.annotations = state.annotations.map((annotation) => ({
        ...annotation,
        remoteStatus: exportHighlights.get(annotation.remoteId)?.isDeleted ? 'deleted'
          : readerItemIds.has(annotation.remoteId) || exportHighlights.has(annotation.remoteId) ? 'present' : 'unconfirmed'
      }));
      state.remoteLifecycle = {
        checkedAt: now, connectionRef: run.connectionRef, export: exportFact, reader, scope: run.scope
      };
      saveLifecycleState(tx, row, state, now);
      if (reader === 'present') presentCount += 1;
      if (reader === 'missing') readerMissingCount += 1;
      if (exportFact === 'deleted') exportDeletedCount += 1;
      if (reader === 'unconfirmed' || exportFact === 'unconfirmed') unconfirmedCount += 1;
    }
    tx.execute('DELETE FROM readwise_api_reconcile_stage WHERE connection_ref = ?', [run.connectionRef]);
    tx.execute('DELETE FROM readwise_api_reconcile_runs WHERE connection_ref = ?', [run.connectionRef]);
  });
  return { exportDeletedCount, presentCount, readerMissingCount, reconciledAt: now, unconfirmedCount };
}

function markReadwiseLifecycleUnconfirmed(
  driver: DatabaseDriver,
  connectionRef: string,
  scope: ReadwiseReconcileScope,
  now: string
) {
  for (const row of loadLifecycleRows(driver, connectionRef)) {
    const state = normalizeReadwiseApiDocumentImportState(parseJson(row.remote_import_state_json));
    state.annotations = state.annotations.map((annotation) => ({ ...annotation, remoteStatus: 'unconfirmed' }));
    state.remoteLifecycle = { checkedAt: null, connectionRef, export: 'unconfirmed', reader: 'unconfirmed', scope };
    saveLifecycleState(driver, row, state, now);
  }
}

function loadLifecycleRows(driver: DatabaseDriver, connectionRef: string) {
  return driver.queryAll<ImportSourceLifecycleRow>(
    `SELECT source_fingerprint, remote_document_id, remote_import_state_json FROM import_sources
     WHERE remote_provider = 'readwise' AND remote_connection_ref = ? AND remote_document_id IS NOT NULL`,
    [connectionRef]
  );
}

function remoteId(item: ReadwiseReconcileExportBook | { category: string | null; id: string }) {
  return 'id' in item ? item.id : item.externalId;
}

function saveLifecycleState(
  driver: DatabaseDriver,
  row: ImportSourceLifecycleRow,
  state: ReturnType<typeof normalizeReadwiseApiDocumentImportState>,
  now: string
) {
  driver.execute('UPDATE import_sources SET remote_import_state_json = ? WHERE source_fingerprint = ?', [
    JSON.stringify(state), row.source_fingerprint
  ]);
  recordImportSourceSync(driver, row.source_fingerprint, now);
}

function toRunState(row: Record<string, unknown>): ReadwiseApiReconcileRunState {
  return {
    connectionRef: String(row.connection_ref),
    exportCursor: typeof row.export_cursor === 'string' ? row.export_cursor : null,
    phase: row.phase === 'export' || row.phase === 'ready' ? row.phase : 'reader',
    readerCursor: typeof row.reader_cursor === 'string' ? row.reader_cursor : null,
    scope: JSON.parse(String(row.scope_json)),
    startedAt: String(row.started_at)
  };
}

function parseJson(value: string) {
  try { return JSON.parse(value); } catch { return null; }
}
