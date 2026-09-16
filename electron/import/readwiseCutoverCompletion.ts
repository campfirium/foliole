import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import { readwiseApiOverlapBoundary } from '../database/readwiseApiImportState.js';
import { loadReadwiseSourceCutover } from '../database/readwiseSourceCutover.js';
import { writeJsonSetting } from '../database/settingsStore.js';

export function completeCutoverDownload(
  driver: DatabaseDriver, connectionRef: string, documents: PreparedReadwiseApiDocument[], now: string
) {
  const run = driver.queryOne<{ round_started_at: string }>(
    'SELECT round_started_at FROM readwise_api_import_runs WHERE connection_ref = ?', [connectionRef]
  );
  if (!run || !Number.isFinite(Date.parse(run.round_started_at))) {
    throw new Error('readwise_source_cutover_download_boundary_missing');
  }
  const state = loadReadwiseSourceCutover();
  if (state?.version === 2 && state.failures?.length) {
    const failed = new Set(state.failures.map((item) => item.remoteId));
    writeJsonSetting(driver, 'readwise_source_cutover_failed_facts', {
      connectionRef, startedAt: run.round_started_at,
      documents: documents.filter((item) => failed.has(item.id)), failures: state.failures
    }, now);
  }
  writeJsonSetting(driver, 'readwise_api_import_state', {
    completedThrough: readwiseApiOverlapBoundary(run.round_started_at), connectionRef, updatedAt: now, version: 1
  }, now);
  driver.execute('DELETE FROM readwise_api_import_stage WHERE connection_ref = ?', [connectionRef]);
  driver.execute('DELETE FROM readwise_api_import_runs WHERE connection_ref = ?', [connectionRef]);
}
