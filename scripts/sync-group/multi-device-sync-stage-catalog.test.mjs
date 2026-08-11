import { expect, it } from 'vitest';

import {
  assertStageTiming, resolveStage, shortestStageChain, stageCatalog, stageHostClosure
} from './multi-device-sync-stage-catalog.mjs';

it('declares every required product stage without embedding its business implementation', () => {
  const names = stageCatalog().map(({ name }) => name);
  expect(names).toEqual([
    'candidate-preparation', 'a-b-group-sync', 'a-b-convergence', 'b-admit-empty-c', 'a-rejoin', 'a-leave',
    'participation-control', 'sync-from-zero'
  ]);
  expect(resolveStage('a-b-group-sync')).toMatchObject({
    action: 'establish-a-b', inputs: ['candidate_bound'], outputs: ['a_b_group_active']
  });
  expect(shortestStageChain('a-b-convergence').map(({ name }) => name)).toEqual([
    'candidate-preparation', 'a-b-group-sync', 'a-b-convergence'
  ]);
});

it('declares ordered milestones and deadlines that cover legal sibling waits', () => {
  const stage = resolveStage('b-admit-empty-c');
  expect(stage).toMatchObject({
    milestones: ['a-listener-ready', 'a-fact-created', 'b-provider-stopped', 'b-transport-ready',
      'b-fact-received', 'a-offline', 'c-join-started', 'b-approval-completed',
      'c-ordinary-sync-completed'],
    siblings: expect.arrayContaining([
      expect.objectContaining({ name: 'android-b-approval', waitsFor: 'windows-c-join' }),
      expect.objectContaining({ name: 'windows-c-join', waitsFor: null })
    ])
  });
  expect(stage.progressDeadlineMs).toBeGreaterThan(60_000);
  expect(() => assertStageTiming({ hardDeadlineMs: 100, name: 'invalid', progressDeadlineMs: 50,
    siblings: [{ hardDeadlineMs: 80, name: 'waiter', waitsFor: 'worker' },
      { hardDeadlineMs: 80, name: 'worker', waitsFor: null }] }))
    .toThrow('Sibling wait deadline is too short');
});

it('limits candidate hosts to the selected product stage closure', () => {
  expect(stageHostClosure(shortestStageChain('a-b-convergence'))).toEqual([
    'macos-a', 'android-b'
  ]);
  expect(stageHostClosure(shortestStageChain('b-admit-empty-c'))).toEqual([
    'macos-a', 'android-b', 'windows-c'
  ]);
});

it('builds only the shortest missing product prerequisite chain', () => {
  expect(shortestStageChain('a-rejoin').map(({ name }) => name)).toEqual([
    'candidate-preparation', 'a-b-group-sync', 'b-admit-empty-c', 'a-rejoin'
  ]);
  expect(shortestStageChain('a-rejoin', ['a_b_group_active']).map(({ name }) => name))
    .toEqual(['b-admit-empty-c', 'a-rejoin']);
});
