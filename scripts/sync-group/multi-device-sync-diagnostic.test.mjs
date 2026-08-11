import { expect, it } from 'vitest';

import { createRun } from './multi-device-sync-contract.mjs';
import { runDiagnostic } from './multi-device-sync-diagnostic.mjs';

const candidate = { branch: 'dev', clean: true, committed: true, controllerDigest: 'controller',
  criteriaDigest: 'criteria', revision: 'a'.repeat(40), scenarioDigest: 'scenario', treeDigest: 'tree' };
const ready = async () => ({ facts: ['ready'] });

it('performs zero stage mutations when any readiness host is blocked', async () => {
  let mutations = 0;
  const result = await runDiagnostic({ adapters: {
    'macos-a': ready, 'android-b': async () => { throw Object.assign(new Error('adb'), {
      missingFact: 'fixed_a5_unavailable' }); }, 'windows-c': ready
  }, candidateProvider: async () => candidate,
  run: createRun({ candidate, mode: 'diagnostic', runId: 'run-1', scenario: 'a-b-group-sync' }),
  stageActions: { 'prepare-candidate': async () => { mutations += 1; } },
  targetStage: 'a-b-group-sync' });
  expect(mutations).toBe(0);
  expect(result.status).toBe('blocked');
});

it('blocks an unbound selected stage instead of treating it as passed', async () => {
  const result = await runDiagnostic({ adapters: {
    'macos-a': ready, 'android-b': ready, 'windows-c': ready
  }, candidateProvider: async () => candidate,
  run: createRun({ candidate, mode: 'diagnostic', runId: 'run-2', scenario: 'a-b-group-sync' }),
  stageActions: { 'prepare-candidate': async () => ({ evidenceRef: 'candidate.json' }) },
  targetStage: 'a-b-group-sync' });
  expect(result.status).toBe('blocked');
  expect(result.receipts.at(-1)).toMatchObject({ missingFact: 'unbound_stage',
    stage: 'a-b-group-sync', status: 'blocked' });
});

it('rechecks all hosts after candidate preparation before product mutation', async () => {
  let mutations = 0;
  const result = await runDiagnostic({ adapters: {
    'macos-a': ready, 'android-b': ready, 'windows-c': ready
  }, candidateProvider: async () => candidate,
  mutationAdapters: { 'macos-a': ready, 'android-b': async () => {
    throw Object.assign(new Error('stale apk'), { missingFact: 'a5_candidate_mismatch' });
  }, 'windows-c': ready },
  run: createRun({ candidate, mode: 'diagnostic', runId: 'run-4', scenario: 'a-b-group-sync' }),
  stageActions: {
    'establish-a-b': async () => { mutations += 1; },
    'prepare-candidate': async () => ({ evidenceRef: 'candidate.json' })
  }, targetStage: 'a-b-group-sync' });
  expect(mutations).toBe(0);
  expect(result.receipts.at(-2)).toMatchObject({
    inputFacts: ['candidate_bound'], missingFact: 'a5_candidate_mismatch',
    stage: 'mutation-readiness', status: 'blocked'
  });
});
