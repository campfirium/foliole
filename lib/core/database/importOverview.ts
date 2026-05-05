import type { PersistedImportRecord } from '../import/contract.js';

import type { DatabaseDriver, DatabaseRow } from './driver.js';

export interface ImportOverview {
  latestFailure: PersistedImportRecord | null;
  latestResult: PersistedImportRecord | null;
  recentRuns: PersistedImportRecord[];
}

interface ImportRunRow extends DatabaseRow {
  id: string;
  provider: PersistedImportRecord['provider'];
  source_name: string;
  source_locator: string;
  source_kind: PersistedImportRecord['sourceKind'];
  source_fingerprint: string;
  content_fingerprint: string;
  duplicate_semantic: PersistedImportRecord['duplicateSemantic'];
  result_status: PersistedImportRecord['resultStatus'];
  imported_at: string;
  node_id: string | null;
  degraded_reason: string | null;
  failure_reason: string | null;
}

function toPersistedImportRecord(row: ImportRunRow): PersistedImportRecord {
  return {
    contentFingerprint: row.content_fingerprint,
    degradedReason: row.degraded_reason,
    duplicateSemantic: row.duplicate_semantic,
    failureReason: row.failure_reason,
    importId: row.id,
    importedAt: row.imported_at,
    nodeId: row.node_id,
    provider: row.provider,
    resultStatus: row.result_status,
    sourceFingerprint: row.source_fingerprint,
    sourceKind: row.source_kind,
    sourceLocator: row.source_locator,
    sourceName: row.source_name
  };
}

function readRecentRuns(driver: DatabaseDriver, limit: number) {
  return driver.queryAll<ImportRunRow>(
    `SELECT
       id,
       provider,
       source_name,
       source_locator,
       source_kind,
       source_fingerprint,
       content_fingerprint,
       duplicate_semantic,
       result_status,
       imported_at,
       node_id,
       degraded_reason,
       failure_reason
     FROM import_runs
     ORDER BY imported_at DESC
     LIMIT ?`,
    [limit]
  );
}

function readLatestFailure(driver: DatabaseDriver) {
  return (
    driver.queryOne<ImportRunRow>(
      `SELECT
         id,
         provider,
         source_name,
         source_locator,
         source_kind,
         source_fingerprint,
         content_fingerprint,
         duplicate_semantic,
         result_status,
         imported_at,
         node_id,
         degraded_reason,
         failure_reason
       FROM import_runs
       WHERE result_status = 'failed'
       ORDER BY imported_at DESC
       LIMIT 1`
    ) ?? null
  );
}

export function loadImportOverview(driver: DatabaseDriver, limit = 6): ImportOverview {
  const recentRuns = readRecentRuns(driver, limit).map(toPersistedImportRecord);
  const latestFailure = readLatestFailure(driver);

  return {
    latestFailure: latestFailure ? toPersistedImportRecord(latestFailure) : null,
    latestResult: recentRuns[0] ?? null,
    recentRuns
  };
}
