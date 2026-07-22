import { expect, it, vi } from 'vitest';

import {
  getCompanionSyncMutationRevision,
  runCompanionSyncMutationTask,
  subscribeCompanionSyncMutationRevision
} from './companionSyncMutationRevision';

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
