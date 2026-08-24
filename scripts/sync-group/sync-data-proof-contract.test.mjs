// @vitest-environment node

import { expect, it } from 'vitest';

import {
  assertExactNoOp, assertExistingMemberAdmissionDataProof, assertFreshJoinDataProof,
  assertLeaveDataProof, assertPauseDataProof, assertRejoinDataProof,
  assertT121ContinuityDataProof
} from './sync-data-proof-contract.mjs';

const action = (name, terminal) => ({
  actionId: `action-${name}`, name, runId: 'run-13', surface: 'public', terminal
});
const mutation = (factId, origin, phase) => ({ factId, origin, phase, runId: 'run-13' });
const fact = (...mutations) => ({ facts: Object.fromEntries(
  mutations.map(({ factId, origin }) => [factId, origin])
) });
const input = (kind) => ({ baselineId: `baseline-${kind}`, kind });

it('freezes fresh join and existing admission as separate exact run and restart proofs', () => {
  const a = mutation('fact-a', 'A');
  const c = mutation('fact-c', 'C');
  expect(assertFreshJoinDataProof({ action: action('sync-now'), input: input('fresh-unpaired'),
    mutation: a, received: fact(a), restarted: fact(a) })).toMatchObject({ restart: 'preserved' });
  expect(assertExistingMemberAdmissionDataProof({ action: action('sync-now'),
    input: input('existing-member-admission'), mutation: c,
    received: [fact(c), fact(c)], restarted: [fact(c), fact(c)] }))
    .toMatchObject({ restart: 'preserved' });
  expect(() => assertFreshJoinDataProof({ action: action('sync-now'),
    input: input('existing-member-admission'), mutation: a, received: fact(a), restarted: fact(a) }))
    .toThrow('fresh-unpaired');
});

it('distinguishes leave correct-failure, survivor success and restart', () => {
  const b = mutation('fact-b', 'B');
  expect(assertLeaveDataProof({ action: action('leave'), departed: fact(),
    input: input('joined-member'), mutation: b, restarted: [fact(b)], survivors: [fact(b)] }))
    .toEqual({ departed: 'correct-failure', outcome: 'success', restart: 'preserved' });
  expect(() => assertLeaveDataProof({ action: action('leave'), departed: fact(b),
    input: input('joined-member'), mutation: b, restarted: [fact(b)], survivors: [fact(b)] }))
    .toThrow('departed member');
});

it('keeps rejoin and pause outcomes independent', () => {
  const a = mutation('fact-a', 'A');
  const b = mutation('fact-b', 'B');
  expect(assertRejoinDataProof({ action: action('rejoin'), input: input('departed-member'),
    mutations: [a, b], received: [fact(a, b)], restarted: [fact(a, b)] }))
    .toMatchObject({ outcome: 'success' });
  const paused = mutation('fact-paused', 'B');
  const resumed = mutation('fact-resumed', 'B');
  expect(assertPauseDataProof({ action: action('pause-resume'), input: input('active-member'),
    pausedMutation: paused, paused: fact(), resumedMutation: resumed,
    resumed: fact(resumed), restarted: fact(resumed) }))
    .toMatchObject({ paused: 'correct-failure', resumed: 'success' });
});

it('requires exact T121 phase facts and restart without accepting proxy state', () => {
  const mutations = [mutation('fact-offline', 'A', 'offline'),
    mutation('fact-rejoin', 'B', 'rejoin'), mutation('fact-zero', 'C', 'cursor-zero'),
    mutation('fact-continuity', 'A', 'continuity')];
  const all = fact(...mutations);
  const phases = { offline: [all], rejoin: [all], 'cursor-zero': [all], continuity: [all] };
  expect(assertT121ContinuityDataProof({ action: action('continuity'),
    input: input('t121-continuity'), mutations, phases, restarted: [all] }))
    .toMatchObject({ outcome: 'success', restart: 'preserved' });
  expect(() => assertT121ContinuityDataProof({ action: action('continuity'),
    input: input('t121-continuity'), mutations,
    phases: { ...phases, 'cursor-zero': [{ latest: 'success', nodeCount: 3 }] },
    restarted: [all] })).toThrow('cursor-zero');
});

it('classifies an exact unchanged terminal as no-op instead of success or restart', () => {
  expect(assertExactNoOp({ action: action('sync-now', 'no-op'),
    afterDigest: 'digest-1', beforeDigest: 'digest-1' }))
    .toEqual({ outcome: 'no-op', runId: 'run-13' });
  expect(() => assertExactNoOp({ action: action('sync-now', 'no-op'),
    afterDigest: 'digest-2', beforeDigest: 'digest-1' })).toThrow('no-op changed data');
});
