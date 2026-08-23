import { expect, it } from 'vitest';

import {
  createRun, finalizeRun, recordReceipt
} from './multi-device-sync-contract.mjs';

function candidate(overrides = {}) {
  return { branch: 'dev', clean: true, committed: true,
    revision: 'a'.repeat(40), sourceRef: 'refs/heads/dev',
    treeDigest: 'b'.repeat(40), ...overrides };
}

function receipt(overrides = {}) {
  return { completedAt: '2026-08-11T00:00:01.000Z', durationMs: 1_000,
    failureOwner: 'environment', host: 'macos-a', inputFacts: [],
    lastProgressAt: '2026-08-11T00:00:01.000Z', outputFacts: ['mac_ready'],
    stage: 'environment-readiness', startedAt: '2026-08-11T00:00:00.000Z',
    status: 'passed', ...overrides };
}

it('pins whole source identity without treating controller details as candidate provenance', () => {
  const run = createRun({ candidate: candidate(), mode: 'formal', runId: 'run-1', scenario: 'a-b' });
  recordReceipt(run, receipt());
  expect(finalizeRun(run, candidate({ treeDigest: 'c'.repeat(40) }))).toMatchObject({
    invalidatedBy: 'treeDigest', status: 'invalidated'
  });
});

it('accepts an explicitly bound branch and rejects a source-ref mismatch', () => {
  expect(() => createRun({ candidate: candidate({
    branch: 'codex/t121-8', sourceRef: 'refs/heads/codex/t121-8'
  }), mode: 'diagnostic', runId: 'branch-run', scenario: 'a-b' })).not.toThrow();
  expect(() => createRun({ candidate: candidate({ branch: 'codex/t121-8' }),
    mode: 'diagnostic', runId: 'mismatch-run', scenario: 'a-b' }))
    .toThrow('candidate is not frozen');
});

it('requires precise attribution on every non-passing receipt', () => {
  const run = createRun({ candidate: candidate(), mode: 'diagnostic', runId: 'run-2', scenario: 'a-b' });
  expect(() => recordReceipt(run, receipt({ missingFact: 'adb_unavailable',
    lastSuccessfulAction: 'adb_server_started', status: 'blocked' }))).not.toThrow();
  expect(() => recordReceipt(createRun({ candidate: candidate(), mode: 'diagnostic',
    runId: 'run-3', scenario: 'a-b' }), receipt({ status: 'failed' })))
    .toThrow('failed receipt attribution is incomplete');
});
