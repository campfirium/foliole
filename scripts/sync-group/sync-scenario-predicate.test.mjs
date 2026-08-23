// @vitest-environment node

import { expect, it } from 'vitest';

import {
  assertBidirectionalConvergence, assertExactDatasetConvergence,
  assertFreshJoinInitialConvergence, assertLeaveContinuity, assertPauseResumeContinuity,
  factObservation
} from './sync-scenario-predicate.mjs';

const mutationA = { factId: 'fact-a', origin: 'A', runId: 'run-1' };
const mutationB = { factId: 'fact-b', origin: 'B', runId: 'run-1' };
const both = factObservation({ 'fact-a': 'A', 'fact-b': 'B' });

it('accepts fresh join only for the exact run fact before and after restart', () => {
  expect(assertFreshJoinInitialConvergence({ mutation: mutationA, received: both,
    restarted: both })).toMatchObject({ factId: 'fact-a', restarted: true, runId: 'run-1' });
  expect(() => assertFreshJoinInitialConvergence({ mutation: mutationA,
    received: factObservation({ 'older-fact': 'A' }), restarted: both }))
    .toThrow('exact initial fact');
});

it('keeps the bidirectional predicate unchanged across receive and restart', () => {
  expect(assertBidirectionalConvergence({ mutations: [mutationA, mutationB],
    observations: { received: [both, both], restarted: [both, both] } }))
    .toMatchObject({ factIds: ['fact-a', 'fact-b'], restarted: true });
  expect(() => assertBidirectionalConvergence({ mutations: [mutationA, mutationB],
    observations: { received: [both, both], restarted: [both,
      factObservation({ 'fact-a': 'A' })] } })).toThrow('at restarted');
});

it('distinguishes paused refusal, resumed continuity and restart', () => {
  expect(assertPauseResumeContinuity({ mutation: mutationA,
    paused: factObservation({}), resumed: both, restarted: both }))
    .toMatchObject({ refusedWhilePaused: true, restarted: true });
  expect(() => assertPauseResumeContinuity({ mutation: mutationA,
    paused: both, resumed: both, restarted: both })).toThrow('paused participant');
});

it('requires departed refusal and exact survivor convergence', () => {
  expect(assertLeaveContinuity({ mutation: mutationB, departed: factObservation({}),
    survivors: [both, both] })).toMatchObject({ refusedByDeparted: true });
  expect(() => assertLeaveContinuity({ mutation: mutationB, departed: both,
    survivors: [both] })).toThrow('departed participant');
});

it('does not accept counts, cursors or a latest run in place of an exact dataset', () => {
  expect(assertExactDatasetConvergence({ mutation: { datasetDigest: 'digest-1', runId: 'run-1' },
    observations: [{ datasetDigest: 'digest-1' }, { datasetDigest: 'digest-1' }] }))
    .toEqual({ datasetDigest: 'digest-1', runId: 'run-1' });
  expect(() => assertExactDatasetConvergence({ mutation: {
    datasetDigest: 'digest-1', runId: 'run-1'
  }, observations: [{ latestRun: 'success', nodeCount: 99 }, { datasetDigest: 'digest-1' }] }))
    .toThrow('exact dataset');
});
