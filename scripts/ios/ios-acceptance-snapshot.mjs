import { readStateWritebackSnapshot } from './ios-state-writeback-acceptance-runner.mjs';
import { readSyncPackSnapshot } from './ios-sync-pack-acceptance-runner.mjs';

export function readAcceptanceScenarioSnapshot(scenario, options) {
  if (scenario === 'state-writeback-runtime') return readStateWritebackSnapshot(options);
  if (scenario === 'sync-pack-runtime') return readSyncPackSnapshot(options);
  return null;
}
