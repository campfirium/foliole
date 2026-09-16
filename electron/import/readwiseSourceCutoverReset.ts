import { randomUUID } from 'node:crypto';

import { openDatabaseConnection } from '../database/connection.js';
import { loadReadwiseSourceCutover, writeReadwiseSourceCutover } from '../database/readwiseSourceCutover.js';

export function restartIncompleteReadwiseSourceCutover(input: {
  connectionRef: string;
  sourceHost: string;
  startedAt: string;
}) {
  const restartedAt = new Date().toISOString();
  openDatabaseConnection().driver.transaction((driver) => {
    driver.execute('DELETE FROM readwise_api_import_stage WHERE connection_ref = ?', [input.connectionRef]);
    driver.execute('DELETE FROM readwise_api_import_runs WHERE connection_ref = ?', [input.connectionRef]);
  });
  const state = writeReadwiseSourceCutover({
    annotations: [],
    batchId: `${input.connectionRef}:${randomUUID()}`,
    cohortDocumentIds: [],
    completedAt: restartedAt,
    documents: [],
    phase: 'indexing',
    retiredNodeIds: [],
    sourceHost: input.sourceHost,
    startedAt: input.startedAt,
    status: 'migration-in-progress',
    unmatchedLegacy: []
  }, restartedAt);
  return state;
}

export function invalidateIncompleteReadwiseSourceCutover(input: {
  connectionRef: string;
  sourceHost: string;
}) {
  const current = loadReadwiseSourceCutover();
  if (current?.status !== 'migration-in-progress') return false;
  restartIncompleteReadwiseSourceCutover({
    connectionRef: input.connectionRef,
    sourceHost: input.sourceHost,
    startedAt: new Date().toISOString()
  });
  return true;
}
