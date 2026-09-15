import { openDatabaseConnection } from '../database/connection.js';
import { writeReadwiseSourceCutover } from '../database/readwiseSourceCutover.js';

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
    batchId: `${input.connectionRef}:${input.startedAt}`,
    cohortDocumentIds: [],
    completedAt: restartedAt,
    documents: [],
    phase: 'indexing',
    retiredNodeIds: [],
    sourceHost: input.sourceHost,
    startedAt: input.startedAt,
    status: 'migration-in-progress'
  }, restartedAt);
  return state;
}
