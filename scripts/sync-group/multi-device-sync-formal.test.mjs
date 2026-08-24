// @vitest-environment node

import { expect, it, vi } from 'vitest';

import { cleanupPassedState } from './multi-device-sync-cli.mjs';
import { createRun } from './multi-device-sync-contract.mjs';
import { runDiagnostic } from './multi-device-sync-diagnostic.mjs';
import { runFormal } from './multi-device-sync-formal.mjs';

const candidate = { branch: 'dev', clean: true, committed: true,
  revision: 'a'.repeat(40), sourceRef: 'refs/heads/dev', treeDigest: 'b'.repeat(40) };
const ready = async () => ({ facts: ['ready'] });
const adapters = { 'android-b': ready, 'macos-a': ready, 'windows-c': ready };

function actions(failAt = null) {
  const milestones = {
    'admit-c': ['a-listener-ready', 'a-fact-created', 'b-provider-stopped',
      'b-transport-ready', 'b-fact-received', 'a-offline', 'c-join-started',
      'b-approval-completed', 'c-ordinary-sync-completed'],
    'establish-a-b': ['macos-group-created', 'a5-paired', 'a-b-synced'],
    'prepare-candidate': ['candidate-prepared']
  };
  return Object.fromEntries([
    ['prepare-candidate', 'candidate.json'], ['establish-a-b', 'a-b.json'],
    ['admit-c', 'b-c.json']
  ].map(([name, evidenceRef]) => [name, vi.fn(async ({ reportProgress }) => {
    if (name === failAt) throw Object.assign(new Error('product red'), {
      failureOwner: 'product', host: 'windows-c', missingFact: 'c_sync_missing'
    });
    milestones[name].forEach(reportProgress);
    return { evidenceRef };
  })]));
}

function run(mode, stageActions) {
  const scenario = mode === 'formal' ? 'a-offline-b-admits-c' : 'b-admit-c';
  const options = { adapters, candidateProvider: async () => candidate, mutationAdapters: adapters,
    run: createRun({ candidate, mode, runId: `${mode}-run`, scenario }), stageActions };
  return mode === 'formal' ? runFormal(options)
    : runDiagnostic({ ...options, targetStage: 'b-admit-c' });
}

it('uses homologous stage facts in diagnostic and formal modes', async () => {
  const diagnostic = await run('diagnostic', actions());
  const formal = await run('formal', actions());
  const productFacts = (value) => value.receipts.filter(({ stage }) => !stage.endsWith('readiness'))
    .map(({ inputFacts, outputFacts, stage, status }) => ({ inputFacts, outputFacts, stage, status }));
  expect(productFacts(formal)).toEqual(productFacts(diagnostic));
  expect(formal.status).toBe('passed');
});

it('stops every later mutation at the first formal red light without retrying', async () => {
  const stageActions = actions('establish-a-b');
  const result = await run('formal', stageActions);
  expect(result.status).toBe('failed');
  expect(stageActions['establish-a-b']).toHaveBeenCalledTimes(1);
  expect(stageActions['admit-c']).not.toHaveBeenCalled();
});

it('preserves passed host state while retaining only formal run evidence', async () => {
  const clearHosts = vi.fn(async () => {});
  const removeRun = vi.fn();
  const options = { repoRoot: '/repo', runId: 'run-1' };
  await cleanupPassedState({ clearHosts, mode: 'formal', options, removeRun });
  expect(clearHosts).toHaveBeenCalledWith(options);
  expect(removeRun).not.toHaveBeenCalled();
  await cleanupPassedState({ clearHosts, mode: 'diagnostic', options, removeRun });
  expect(removeRun).toHaveBeenCalledWith(options);
});
