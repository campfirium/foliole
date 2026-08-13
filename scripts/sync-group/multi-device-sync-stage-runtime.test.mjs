import { expect, it, vi } from 'vitest';

import {
  runBoundedStageAction, settleSiblingActions
} from './multi-device-sync-stage-runtime.mjs';

/* global AbortController, setTimeout */

function stage(overrides = {}) {
  return { activities: [], hardDeadlineMs: 200, host: 'all', milestones: ['started', 'completed'],
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

it('preserves completed milestones when the stage progress envelope expires', async () => {
  await expect(runBoundedStageAction({ action: ({ reportProgress, signal }) => {
    reportProgress('started');
    return new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
  }, run: {}, stage: stage({ hardDeadlineMs: 100, progressDeadlineMs: 20 }) }))
    .rejects.toMatchObject({
      failureOwner: 'product', missingFact: 'declared_semantic_progress', progress: ['started']
    });
});

it('extends the stage window only for declared semantic activity', async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  await expect(runBoundedStageAction({ action: async ({ reportActivity, reportProgress }) => {
    reportProgress('started'); await wait(25); reportActivity('consumer-progress');
    await wait(25); reportProgress('completed'); return {};
  }, run: {}, stage: stage({ activities: ['consumer-progress'],
    hardDeadlineMs: 120, progressDeadlineMs: 40 }) })).resolves.toMatchObject({
      activities: [{ count: 1, name: 'consumer-progress' }],
      progress: ['started', 'completed']
    });
  await expect(runBoundedStageAction({ action: async ({ reportActivity }) => {
    reportActivity('stdout'); return {};
  }, run: {}, stage: stage() })).rejects.toMatchObject({
    failureOwner: 'controller', missingFact: 'activity_invalid'
  });
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

it('lets a declared terminal sibling release its bounded waiter before joining both', async () => {
  const controller = new AbortController();
  const approval = new Promise((resolve) => {
    controller.signal.addEventListener('abort', () => resolve('approved'), { once: true });
  });
  await expect(settleSiblingActions([
    { name: 'approval', work: approval }, { name: 'windows', work: Promise.resolve('synced') }
  ], () => controller.abort(), ['windows'])).resolves.toEqual({
    approval: 'approved', windows: 'synced'
  });
});

it('tells sibling cancellation whether the first terminal failed or succeeded', async () => {
  let rejectFailedApproval;
  const failedApproval = new Promise((_resolve, reject) => { rejectFailedApproval = reject; });
  const failed = vi.fn(() => rejectFailedApproval(new Error('approval cancelled')));
  await expect(settleSiblingActions([
    { name: 'approval', work: failedApproval },
    { name: 'windows', work: Promise.reject(new Error('start failed')) }
  ], failed)).rejects.toThrow('start failed');
  expect(failed).toHaveBeenCalledWith('windows', 'rejected');

  let resolveSucceededApproval;
  const succeededApproval = new Promise((resolve) => { resolveSucceededApproval = resolve; });
  const succeeded = vi.fn(() => resolveSucceededApproval('approved'));
  await settleSiblingActions([
    { name: 'approval', work: succeededApproval },
    { name: 'windows', work: Promise.resolve('synced') }
  ], succeeded, ['windows']);
  expect(succeeded).toHaveBeenCalledWith('windows', 'fulfilled');
});
