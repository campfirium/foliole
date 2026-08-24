import { expect, it } from 'vitest';

import {
  assertStageTiming, resolveStage, shortestStageChain, stageCatalog, stageHostClosure
} from './multi-device-sync-stage-catalog.mjs';

it('declares every required product stage without embedding its business implementation', () => {
  const names = stageCatalog().map(({ name }) => name);
  expect(names).toEqual([
    'candidate-preparation', 'a-b-group-sync', 'a-b-convergence', 'b-admit-c', 'a-rejoin', 'a-leave',
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
  expect(resolveStage('candidate-preparation')).toMatchObject({
    activities: expect.arrayContaining([
      'candidate-macos-started', 'candidate-android-built', 'candidate-windows-started'
    ]), milestones: ['candidate-prepared']
  });
  const stage = resolveStage('b-admit-c');
  expect(stage).toMatchObject({
    milestones: ['a-listener-ready', 'b-provider-stopped', 'b-transport-ready', 'a-fact-created',
      'b-fact-received', 'a-offline', 'c-join-started', 'b-approval-completed',
      'c-ordinary-sync-completed'],
    siblings: expect.arrayContaining([
      expect.objectContaining({ name: 'android-b-approval', waitsFor: 'windows-c-join' }),
      expect.objectContaining({ name: 'windows-c-join', waitsFor: null })
    ])
  });
  expect(stage.progressDeadlineMs).toBeGreaterThanOrEqual(
    Math.max(...stage.siblings.map(({ hardDeadlineMs }) => hardDeadlineMs))
  );
  expect(resolveStage('a-rejoin')).toMatchObject({
    action: 'rejoin-a', milestones: ['a-listener-ready', 'three-members-converged',
      'a-fact-created', 'b-fact-created', 'c-fact-created', 'three-facts-converged',
      'three-members-restarted']
  });
  expect(resolveStage('a-leave')).toMatchObject({
    action: 'leave-a', activities: ['b-consumer-progress'],
    milestones: ['survivor-provider-ready', 'a-left',
      'a-restarted-unbound', 'b-two-members-active', 'b-fact-created', 'c-fact-created',
      'survivor-facts-converged', 'survivors-restarted', 'former-a-revoked'],
    progressDeadlineMs: 70_000
  });
  expect(resolveStage('participation-control')).toMatchObject({
    action: 'set-participation', milestones: [
      'windows-paused', 'macos-pause-persisted', 'macos-resumed-cursor',
      'macos-sync-off-persisted', 'android-sync-off-persisted', 'android-pause-persisted',
      'android-resumed-cursor', 'macos-left-while-sync-off', 'macos-departure-observed',
      'android-left-while-paused',
      'windows-resumed-cursor', 'windows-sync-off-persisted', 'windows-last-member-left',
      'all-restarted-unbound'
    ]
  });
  expect(resolveStage('sync-from-zero')).toMatchObject({
    action: 'prove-sync-from-zero', activities: expect.arrayContaining([
      'dataset-mutation-progress', 'windows-cursor-progress', 'windows-resource-progress'
    ]), milestones: [
      'dataset-created', 'b-provider-stopped', 'b-transport-ready',
      'android-structure-batches-complete', 'android-content-batches-complete',
      'android-attachment-batches-complete', 'macos-offline', 'windows-join-started',
      'android-approval-completed', 'windows-cursor-resumed',
      'windows-structure-batches-complete', 'windows-content-batches-complete',
      'windows-attachment-batches-complete', 'three-host-converged',
      'provider-resources-preserved', 'peer-progress-converged'
    ], progressDeadlineMs: 60_000
  });
  expect(() => assertStageTiming({ hardDeadlineMs: 100, name: 'invalid', progressDeadlineMs: 50,
    siblings: [{ hardDeadlineMs: 80, name: 'waiter', waitsFor: 'worker' },
      { hardDeadlineMs: 80, name: 'worker', waitsFor: null }] }))
    .toThrow('Sibling wait deadline is too short');
  expect(() => assertStageTiming({ hardDeadlineMs: 120, name: 'invalid-progress',
    progressDeadlineMs: 70, siblings: [{ hardDeadlineMs: 80, name: 'worker', waitsFor: null }] }))
    .toThrow('Stage progress deadline is shorter than its sibling window');
});

it('limits candidate hosts to the selected product stage closure', () => {
  expect(stageHostClosure(shortestStageChain('a-b-convergence'))).toEqual([
    'macos-a', 'android-b'
  ]);
  expect(stageHostClosure(shortestStageChain('b-admit-c'))).toEqual([
    'macos-a', 'android-b', 'windows-c'
  ]);
});

it('builds only the shortest missing product prerequisite chain', () => {
  expect(shortestStageChain('a-rejoin').map(({ name }) => name)).toEqual([
    'candidate-preparation', 'a-b-group-sync', 'b-admit-c', 'a-rejoin'
  ]);
  expect(shortestStageChain('a-rejoin', ['a_b_group_active']).map(({ name }) => name))
    .toEqual(['b-admit-c', 'a-rejoin']);
  expect(shortestStageChain('participation-control').map(({ name }) => name)).toEqual([
    'candidate-preparation', 'a-b-group-sync', 'b-admit-c', 'a-rejoin',
    'participation-control'
  ]);
  expect(shortestStageChain('sync-from-zero').map(({ name }) => name)).toEqual([
    'candidate-preparation', 'a-b-group-sync', 'sync-from-zero'
  ]);
});
