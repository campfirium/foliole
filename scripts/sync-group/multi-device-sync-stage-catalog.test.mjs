import { expect, it } from 'vitest';

import {
  resolveStage, shortestStageChain, stageCatalog, stageHostClosure
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
