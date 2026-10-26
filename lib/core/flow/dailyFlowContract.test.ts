import { expect, it } from 'vitest';

import { dailyFlowCommitSchema, dailyFlowOpenSchema } from './dailyFlowContract.js';

const session = { currentNodeId: 'a', isAnswerRevealed: false, queueNodeIds: ['a'], totalNodeCount: 1 };
const now = '2026-10-26T08:00:00.000Z';
const token = { scope: 'library-a', dayKey: now, revision: 1 };

it('accepts the typed initialization and navigation envelopes and rejects unexpected fields', () => {
  expect(dailyFlowOpenSchema.parse({ now, mode: 'recommended', seed: session }).seed).toEqual(session);
  expect(dailyFlowCommitSchema.parse({ opId: 'action', now, token, nextSession: session }).token).toEqual(token);
  expect(() => dailyFlowOpenSchema.parse({ now, mode: 'recommended', sql: 'DELETE FROM nodes' })).toThrow();
  expect(() => dailyFlowCommitSchema.parse({ opId: 'action', now, token, nextSession: session, command: 'other' })).toThrow();
});

it.each([{ ...token, revision: -1 }, { ...token, revision: 1.5 }, { dayKey: now, revision: 1 }])(
  'rejects incomplete or invalid cursor identities (%j)', invalid => {
    expect(() => dailyFlowCommitSchema.parse({ opId: 'action', now, token: invalid, nextSession: session })).toThrow();
  });

it('rejects malformed learning facts before a storage transaction can execute', () => {
  expect(() => dailyFlowCommitSchema.parse({ opId: 'action', now, token, nextSession: session,
    readings: [{ nodeId: 'a', before: null, after: { nextAt: now } }] })).toThrow();
  expect(() => dailyFlowCommitSchema.parse({ opId: 'action', now, token, nextSession: session,
    grade: { nodeId: 'a', grade: 5 } })).toThrow();
});

it('requires a current-topic mutation for typed reading advancement', () => {
  const profile = { intervalDurationMs: 60000, intervalGrowthFactor: 2, lastHandledAt: now,
    nextAt: now, priority: 5, readingPosition: 0, repetitionCount: 1, state: 'active' };
  const args = { opId: 'read', now, token, sourceSession: session, readingAction: 'read',
    readings: [{ nodeId: 'a', before: null, after: profile }] };
  expect(dailyFlowCommitSchema.parse(args).readingAction).toBe('read');
  expect(() => dailyFlowCommitSchema.parse({ ...args, readings: [] })).toThrow();
  expect(() => dailyFlowCommitSchema.parse({ ...args, sourceSession: { ...session, currentNodeId: 'other' } })).toThrow();
  expect(() => dailyFlowCommitSchema.parse({ ...args, readingAction: 'other' })).toThrow();
});
