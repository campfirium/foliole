import { expect, it, vi } from 'vitest';

import { createRun } from './multi-device-sync-contract.mjs';
import { runDiagnostic } from './multi-device-sync-diagnostic.mjs';

const candidate = { branch: 'dev', clean: true, committed: true,
  revision: 'a'.repeat(40), sourceRef: 'refs/heads/dev', treeDigest: 'b'.repeat(40) };
const ready = async () => ({ facts: ['ready'] });

it('performs zero stage mutations when any readiness host is blocked', async () => {
  let mutations = 0;
  const result = await runDiagnostic({ adapters: {
    'macos-a': ready, 'android-b': async () => { throw Object.assign(new Error('adb'), {
      missingFact: 'fixed_a5_unavailable' }); }, 'windows-c': ready
  }, candidateProvider: async () => candidate,
  run: createRun({ candidate, mode: 'diagnostic', runId: 'run-1', scenario: 'a-b-group-sync' }),
  stageActions: { 'prepare-candidate': async ({ reportProgress }) => {
    mutations += 1; reportProgress('candidate-prepared'); return {};
  } },
  targetStage: 'a-b-group-sync' });
  expect(mutations).toBe(0);
  expect(result.status).toBe('blocked');
});

it('does not consult Windows readiness for an A/B-only stage closure', async () => {
  const windows = vi.fn(ready);
  const result = await runDiagnostic({ adapters: {
    'macos-a': ready, 'android-b': ready, 'windows-c': windows
  }, availableFacts: ['candidate_bound'], candidateProvider: async () => candidate,
  readinessHosts: ['macos-a', 'android-b'],
  run: createRun({ candidate, mode: 'diagnostic', runId: 'run-ab', scenario: 'a-b-group-sync' }),
  stageActions: { 'establish-a-b': async ({ reportProgress }) => {
    ['macos-group-created', 'a5-paired', 'a-b-synced'].forEach(reportProgress);
    return { evidenceRef: 'a-b.json' };
  } },
  targetStage: 'a-b-group-sync' });
  expect(result.status).toBe('passed');
  expect(windows).not.toHaveBeenCalled();
});

it('preserves bounded failure detail and evidence without advancing later stages', async () => {
  const result = await runDiagnostic({ adapters: {
    'macos-a': ready, 'android-b': ready, 'windows-c': ready
  }, availableFacts: ['candidate_bound'], candidateProvider: async () => candidate,
  run: createRun({ candidate, mode: 'diagnostic', runId: 'run-5', scenario: 'a-b-group-sync' }),
  stageActions: { 'establish-a-b': async () => { throw Object.assign(new Error('receipt missing'), {
    evidenceRef: '/evidence/action.log', executionOwner: 'environment',
    failureAxis: 'execution', host: 'android-b',
    lastSuccessfulAction: 'stage_started', missingFact: 'pair_sync_receipt'
  }); } }, targetStage: 'a-b-group-sync' });
  expect(result.receipts.at(-1)).toMatchObject({ evidenceRef: '/evidence/action.log',
    failureDetail: 'receipt missing', failureOwner: 'environment', host: 'android-b',
    lastSuccessfulAction: 'stage_started', missingFact: 'pair_sync_receipt', status: 'failed' });
});

it('routes only an explicit proof failure to the product owner', async () => {
  const result = await runDiagnostic({ adapters: {
    'macos-a': ready, 'android-b': ready
  }, availableFacts: ['candidate_bound'], candidateProvider: async () => candidate,
  readinessHosts: ['macos-a', 'android-b'],
  run: createRun({ candidate, mode: 'diagnostic', runId: 'run-proof',
    scenario: 'a-b-group-sync' }),
  stageActions: { 'establish-a-b': async () => {
    throw Object.assign(new Error('exact fact missing'), {
      failureAxis: 'proof', host: 'android-b', missingFact: 'exact_run_fact'
    });
  } }, targetStage: 'a-b-group-sync' });
  expect(result.receipts.at(-1)).toMatchObject({
    failureOwner: 'product', host: 'android-b', missingFact: 'exact_run_fact'
  });
});

it('keeps scenario observation drift out of the product failure route', async () => {
  const result = await runDiagnostic({ adapters: {
    'macos-a': ready, 'android-b': ready
  }, availableFacts: ['candidate_bound'], candidateProvider: async () => candidate,
  readinessHosts: ['macos-a', 'android-b'],
  run: createRun({ candidate, mode: 'diagnostic', runId: 'run-observation-drift',
    scenario: 'a-b-group-sync' }),
  stageActions: { 'establish-a-b': async ({ reportProgress }) => {
    reportProgress('adapter-ready'); return { evidenceRef: 'raw.json' };
  } }, targetStage: 'a-b-group-sync' });
  expect(result.receipts.at(-1)).toMatchObject({
    failureOwner: 'controller', missingFact: 'milestone_order_invalid'
  });
});

it('blocks an unbound selected stage instead of treating it as passed', async () => {
  const result = await runDiagnostic({ adapters: {
    'macos-a': ready, 'android-b': ready, 'windows-c': ready
  }, candidateProvider: async () => candidate,
  run: createRun({ candidate, mode: 'diagnostic', runId: 'run-2', scenario: 'a-b-group-sync' }),
  stageActions: { 'prepare-candidate': async ({ reportProgress }) => {
    reportProgress('candidate-prepared'); return { evidenceRef: 'candidate.json' };
  } },
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
    'prepare-candidate': async ({ reportProgress }) => {
      reportProgress('candidate-prepared'); return { evidenceRef: 'candidate.json' };
    }
  }, targetStage: 'a-b-group-sync' });
  expect(mutations).toBe(0);
  expect(result.receipts.at(-2)).toMatchObject({
    inputFacts: ['candidate_bound'], missingFact: 'a5_candidate_mismatch',
    stage: 'mutation-readiness', status: 'blocked'
  });
});
