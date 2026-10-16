import { expect, it, vi } from 'vitest';

import { attachmentWorkBudget } from '../../../../../../lib/core/sync/attachmentWorkBudget.js';

import {
  getCompanionSyncMutationRevision,
  runCompanionHighValueMutationTask,
  runCompanionSyncMutationTask,
  subscribeCompanionHighValueMutation,
  subscribeCompanionSyncMutationRevision
} from './companionSyncMutationRevision';

it('keeps attachment streaming for private writes and yields after a committed syncable write', async () => {
  const shouldYield = attachmentWorkBudget(60_000);
  await runCompanionSyncMutationTask(async () => 'view saved');
  expect(shouldYield()).toBe(false);
  await expect(runCompanionHighValueMutationTask(async () => {
    throw new Error('write failed');
  })).rejects.toThrow('write failed');
  expect(shouldYield()).toBe(false);
  await runCompanionHighValueMutationTask(async () => 'content saved');
  expect(shouldYield()).toBe(true);
});

it('publishes a new revision only after a successful local mutation', async () => {
  const listener = vi.fn();
  const initialRevision = getCompanionSyncMutationRevision();
  const unsubscribe = subscribeCompanionSyncMutationRevision(listener);

  await expect(runCompanionSyncMutationTask(async () => 'saved')).resolves.toBe('saved');
  expect(getCompanionSyncMutationRevision()).toBe(initialRevision + 1);
  expect(listener).toHaveBeenCalledTimes(1);

  await expect(runCompanionSyncMutationTask(async () => {
    throw new Error('not saved');
  })).rejects.toThrow('not saved');
  expect(getCompanionSyncMutationRevision()).toBe(initialRevision + 1);
  expect(listener).toHaveBeenCalledTimes(1);
  unsubscribe();
});

it('does not turn an observer error into a failed committed mutation', async () => {
  const unsubscribe = subscribeCompanionSyncMutationRevision(() => {
    throw new Error('observer failed');
  });

  await expect(runCompanionSyncMutationTask(async () => 'saved')).resolves.toBe('saved');
  unsubscribe();
});

it('publishes a high-value trigger only after its permanent write succeeds', async () => {
  const listener = vi.fn();
  const unsubscribe = subscribeCompanionHighValueMutation(listener);

  await runCompanionHighValueMutationTask(async () => 'saved');
  await expect(runCompanionHighValueMutationTask(async () => {
    throw new Error('write failed');
  })).rejects.toThrow('write failed');

  expect(listener).toHaveBeenCalledOnce();
  unsubscribe();
});
