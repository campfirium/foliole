import { expect, it } from 'vitest';

import {
  createRun, finalizeRun, recordReceipt
} from './multi-device-sync-contract.mjs';

function candidate(overrides = {}) {
  return { branch: 'dev', clean: true, committed: true, controllerDigest: 'controller',
    criteriaDigest: 'criteria', revision: 'a'.repeat(40), scenarioDigest: 'scenario',
    treeDigest: 'tree', ...overrides };
}

function receipt(overrides = {}) {
  return { completedAt: '2026-08-11T00:00:01.000Z', durationMs: 1_000,
    failureOwner: 'environment', host: 'macos-a', inputFacts: [],
    lastProgressAt: '2026-08-11T00:00:01.000Z', outputFacts: ['mac_ready'],
    stage: 'environment-readiness', startedAt: '2026-08-11T00:00:00.000Z',
    status: 'passed', ...overrides };
}

it('pins candidate identity and invalidates a run when any frozen digest changes', () => {
  const run = createRun({ candidate: candidate(), mode: 'formal', runId: 'run-1', scenario: 'a-b' });
  recordReceipt(run, receipt());
  expect(finalizeRun(run, candidate({ controllerDigest: 'changed' }))).toMatchObject({
    invalidatedBy: 'controllerDigest', status: 'invalidated'
  });
});

it('requires precise attribution on every non-passing receipt', () => {
  const run = createRun({ candidate: candidate(), mode: 'diagnostic', runId: 'run-2', scenario: 'a-b' });
  expect(() => recordReceipt(run, receipt({ missingFact: 'adb_unavailable',
    lastSuccessfulAction: 'adb_server_started', status: 'blocked' }))).not.toThrow();
  expect(() => recordReceipt(createRun({ candidate: candidate(), mode: 'diagnostic',
    runId: 'run-3', scenario: 'a-b' }), receipt({ status: 'failed' })))
    .toThrow('failed receipt attribution is incomplete');
});
