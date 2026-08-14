import { expect, it } from 'vitest';

import {
  assertScenarioTopology, resolveScenario
} from './multi-device-sync-scenario-catalog.mjs';

it('accepts only a complete ordered formal topology', () => {
  expect(resolveScenario('a-offline-b-admits-c').stages).toEqual([
    'candidate-preparation', 'a-b-group-sync', 'b-admit-c'
  ]);
  expect(resolveScenario('three-device-convergence').stages).toEqual([
    'candidate-preparation', 'a-b-group-sync', 'b-admit-c', 'a-rejoin'
  ]);
  expect(resolveScenario('founder-leave-continuity').stages).toEqual([
    'candidate-preparation', 'a-b-group-sync', 'b-admit-c', 'a-rejoin', 'a-leave'
  ]);
  expect(resolveScenario('participation-control-continuity').stages).toEqual([
    'candidate-preparation', 'a-b-group-sync', 'b-admit-c', 'a-rejoin',
    'participation-control'
  ]);
  expect(resolveScenario('nonempty-library-convergence').stages).toEqual([
    'candidate-preparation', 'a-b-group-sync', 'a-b-convergence', 'b-admit-c', 'a-rejoin'
  ]);
  expect(resolveScenario('sync-from-zero-continuity').stages).toEqual([
    'candidate-preparation', 'a-b-group-sync', 'sync-from-zero'
  ]);
  expect(() => assertScenarioTopology({
    stages: ['candidate-preparation', 'b-admit-c']
  })).toThrow('requires a_b_group_active');
});

it('rejects cyclic formal stage inputs', () => {
  const stages = {
    a: { inputs: ['b_done'], name: 'a', outputs: ['a_done'] },
    b: { inputs: ['a_done'], name: 'b', outputs: ['b_done'] }
  };
  expect(() => assertScenarioTopology({ stages: ['a', 'b'] }, (name) => stages[name]))
    .toThrow('Cyclic scenario stage');
});
