import { expect, it, vi } from 'vitest';

import {
  runBoundedStageAction, settleSiblingActions
} from './multi-device-sync-stage-runtime.mjs';

/* global setTimeout */

function stage(overrides = {}) {
  return { hardDeadlineMs: 200, host: 'all', milestones: ['started', 'completed'],
    name: 'test-stage', progressDeadlineMs: 100, ...overrides };
}

it('accepts only declared semantic milestones in order', async () => {
  await expect(runBoundedStageAction({ action: async ({ reportProgress }) => {
    reportProgress('completed'); return {};
  }, run: {}, stage: stage() })).rejects.toMatchObject({
    failureOwner: 'controller', missingFact: 'milestone_order_invalid'
  });
});

it('classifies an expired controller hard deadline separately from product stall', async () => {
  await expect(runBoundedStageAction({ action: ({ signal }) => new Promise((resolve) => {
    signal.addEventListener('abort', resolve, { once: true });
  }), run: {}, stage: stage({ hardDeadlineMs: 30, progressDeadlineMs: 100 }) }))
    .rejects.toMatchObject({ failureOwner: 'controller', missingFact: 'stage_hard_deadline' });
});

it('joins every sibling before reporting the first failure', async () => {
  const events = [];
  const cancel = vi.fn(() => events.push('cancel'));
  const slow = new Promise((resolve) => setTimeout(() => {
    events.push('slow-settled'); resolve('done');
  }, 30));
  await expect(settleSiblingActions([
    { name: 'approval', work: Promise.reject(new Error('approval failed')) },
    { name: 'windows', work: slow }
  ], cancel)).rejects.toMatchObject({ siblingOutcomes: [
    { name: 'approval', status: 'rejected' }, { name: 'windows', status: 'fulfilled' }
  ] });
  expect(events).toEqual(['cancel', 'slow-settled']);
});
