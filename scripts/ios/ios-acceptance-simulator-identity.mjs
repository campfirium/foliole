import { IOS_ACCEPTANCE_CONTRACT_PEER_ID } from './ios-acceptance-contract-corpus.ts';

const FIXED_CORPUS_SCENARIOS = new Set([
  'content-resource-read',
  'foreground-sync-lifecycle',
  'state-writeback-runtime',
  'sync-pack-runtime'
]);

export function iosAcceptanceSimulatorName(scenario, processId, attemptNumber) {
  if (FIXED_CORPUS_SCENARIOS.has(scenario)) return IOS_ACCEPTANCE_CONTRACT_PEER_ID;
  return `Foliole ${scenario} ${processId} ${attemptNumber}`;
}
