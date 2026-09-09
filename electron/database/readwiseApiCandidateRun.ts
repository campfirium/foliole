import type { ReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import {
  READWISE_API_PIPELINE_VERSION,
  READER_PARENT_CATEGORIES,
  type ReaderParentCategory,
  type ReadwiseApiCandidateManifest,
  type ReadwiseApiCandidateRun
} from '../import/readwiseApiCandidateTypes.js';

import { openDatabaseConnection } from './connection.js';
import { clearReadwiseApiCandidateStage } from './readwiseApiCandidateStage.js';
import {
  completeReadwiseApiImportRun,
  loadReadwiseApiCompletedThrough
} from './readwiseApiImportState.js';

const MANIFEST_KIND = 'candidate-manifest-v2';
const MANIFEST_ID = 'manifest';

export function loadOrCreateReadwiseApiCandidateRun(
  connectionRef: string,
  config: ReadwiseReaderConfig,
  now = new Date().toISOString()
) {
  const signature = candidateScopeSignature(config);
  const current = loadManifest(connectionRef);
  const row = loadRunRow(connectionRef);
  if (!current || current.pipelineVersion !== READWISE_API_PIPELINE_VERSION
    || current.scopeSignature !== signature || (row && !isCandidatePhase(row.phase))) {
    resetCandidateRun(connectionRef, signature, null, now);
  } else if (!row) {
    startCandidateRun(connectionRef, loadReadwiseApiCompletedThrough(connectionRef), now);
  }
  return requireRun(connectionRef);
}

export function restartReadwiseApiCandidateRun(
  connectionRef: string,
  config: ReadwiseReaderConfig,
  now = new Date().toISOString()
) {
  resetCandidateRun(
    connectionRef,
    candidateScopeSignature(config),
    null,
    now
  );
  return requireRun(connectionRef);
}

export function saveReadwiseApiCandidateCursor(input: {
  connectionRef: string;
  cursor: string | null;
  phase: ReadwiseApiCandidateRun['phase'];
  updatedAt?: string;
}) {
  openDatabaseConnection().driver.execute(
    `UPDATE readwise_api_import_runs SET reader_cursor = ?, export_cursor = ?, phase = ?, updated_at = ?
     WHERE connection_ref = ?`,
    [input.phase.startsWith('reader:') ? input.cursor : null,
      input.phase === 'export' ? input.cursor : null, encodePhase(input.phase),
      input.updatedAt ?? new Date().toISOString(), input.connectionRef]
  );
}

export function advanceReadwiseApiCandidateRun(
  connectionRef: string,
  current: ReadwiseApiCandidateRun['phase'],
  includeWithoutHighlights: boolean
) {
  const phase = nextPhase(current, includeWithoutHighlights);
  saveReadwiseApiCandidateCursor({ connectionRef, cursor: null, phase });
  return requireRun(connectionRef);
}

export function loadReadwiseApiCandidateRun(connectionRef: string) {
  const row = loadRunRow(connectionRef);
  return row && isCandidatePhase(row.phase) ? toRun(row) : null;
}

export function deleteReadwiseApiCandidateRun(connectionRef: string) {
  openDatabaseConnection().driver.execute(
    'DELETE FROM readwise_api_import_runs WHERE connection_ref = ?', [connectionRef]
  );
}

export function completeReadwiseApiCandidateRun(connectionRef: string) {
  const run = requireRun(connectionRef);
  completeReadwiseApiImportRun({
    connectionRef,
    exportCursor: null,
    phase: 'ready',
    queryUpdatedAfter: run.queryUpdatedAfter,
    readerCursor: null,
    roundStartedAt: run.roundStartedAt
  });
  clearReadwiseApiCandidateStage(connectionRef);
}

export function candidateScopeSignature(config: ReadwiseReaderConfig) {
  return JSON.stringify({
    withHighlightsDestination: config.withHighlightsDestination,
    withoutHighlightsDestination: config.withoutHighlightsDestination
  });
}

function resetCandidateRun(
  connectionRef: string,
  scopeSignature: string,
  queryUpdatedAfter: string | null,
  now: string
) {
  const driver = openDatabaseConnection().driver;
  driver.transaction((tx) => {
    tx.execute('DELETE FROM readwise_api_import_stage WHERE connection_ref = ?', [connectionRef]);
    tx.execute('DELETE FROM readwise_api_import_runs WHERE connection_ref = ?', [connectionRef]);
    insertCandidateRun(tx, connectionRef, queryUpdatedAfter, now);
    tx.execute(
      `INSERT INTO readwise_api_import_stage (connection_ref, record_kind, remote_id, payload_json)
       VALUES (?, ?, ?, ?)`,
      [connectionRef, MANIFEST_KIND, MANIFEST_ID, JSON.stringify({
        pipelineVersion: READWISE_API_PIPELINE_VERSION, scopeSignature
      } satisfies ReadwiseApiCandidateManifest)]
    );
  });
}

function startCandidateRun(connectionRef: string, queryUpdatedAfter: string | null, now: string) {
  const driver = openDatabaseConnection().driver;
  driver.transaction((tx) => {
    tx.execute(
      `DELETE FROM readwise_api_import_stage
       WHERE connection_ref = ? AND record_kind != ?`,
      [connectionRef, MANIFEST_KIND]
    );
    insertCandidateRun(tx, connectionRef, queryUpdatedAfter, now);
  });
}

function insertCandidateRun(
  driver: ReturnType<typeof openDatabaseConnection>['driver'],
  connectionRef: string,
  queryUpdatedAfter: string | null,
  now: string
) {
  driver.execute(
    `INSERT INTO readwise_api_import_runs (
      connection_ref, query_updated_after, round_started_at, reader_cursor, export_cursor, phase, updated_at
    ) VALUES (?, ?, ?, NULL, NULL, ?, ?)`,
    [connectionRef, queryUpdatedAfter, now, encodePhase('export'), now]
  );
}

function requireRun(connectionRef: string) {
  const row = loadRunRow(connectionRef);
  if (!row || !isCandidatePhase(row.phase)) throw new Error('readwise_api_candidate_run_missing');
  return toRun(row);
}

function loadRunRow(connectionRef: string) {
  return openDatabaseConnection().driver.queryOne<Record<string, unknown>>(
    'SELECT * FROM readwise_api_import_runs WHERE connection_ref = ?', [connectionRef]
  );
}

function loadManifest(connectionRef: string): ReadwiseApiCandidateManifest | null {
  const row = openDatabaseConnection().driver.queryOne<{ payload_json: string }>(
    `SELECT payload_json FROM readwise_api_import_stage
     WHERE connection_ref = ? AND record_kind = ? AND remote_id = ?`,
    [connectionRef, MANIFEST_KIND, MANIFEST_ID]
  );
  try { return row ? JSON.parse(row.payload_json) as ReadwiseApiCandidateManifest : null; } catch { return null; }
}

function toRun(row: Record<string, unknown>): ReadwiseApiCandidateRun {
  const phase = decodePhase(String(row.phase));
  return {
    connectionRef: String(row.connection_ref),
    cursor: phase === 'export'
      ? text(row.export_cursor) : phase.startsWith('reader:') ? text(row.reader_cursor) : null,
    phase,
    queryUpdatedAfter: text(row.query_updated_after),
    roundStartedAt: String(row.round_started_at)
  };
}

function nextPhase(
  current: ReadwiseApiCandidateRun['phase'],
  includeWithoutHighlights: boolean
): ReadwiseApiCandidateRun['phase'] {
  if (current === 'export') return includeWithoutHighlights ? `reader:${READER_PARENT_CATEGORIES[0]}` : 'ready';
  if (!current.startsWith('reader:')) return 'ready';
  const category = current.slice('reader:'.length) as ReaderParentCategory;
  const next = READER_PARENT_CATEGORIES[READER_PARENT_CATEGORIES.indexOf(category) + 1];
  return next ? `reader:${next}` : 'ready';
}

function encodePhase(phase: ReadwiseApiCandidateRun['phase']) {
  return `candidate-v${READWISE_API_PIPELINE_VERSION}:${phase}`;
}

function decodePhase(value: string): ReadwiseApiCandidateRun['phase'] {
  return value.slice(`candidate-v${READWISE_API_PIPELINE_VERSION}:`.length) as ReadwiseApiCandidateRun['phase'];
}

function isCandidatePhase(value: unknown) {
  return typeof value === 'string' && value.startsWith(`candidate-v${READWISE_API_PIPELINE_VERSION}:`);
}

function text(value: unknown) {
  return typeof value === 'string' && value ? value : null;
}
