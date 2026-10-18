import { expect, it, vi } from 'vitest';

import { attachmentWorkBudget } from '../../../../../../lib/core/sync/attachmentWorkBudget.js';
import { companionWorkspaceSnapshots } from '../../companionWorkspaceSnapshotStore.js';
import { invalidateCompanionReadingScope } from '../../reading/companionReadingScope.js';

import {
  getCompanionSyncMutationRevision,
  runCompanionHighValueMutationTask,
  runCompanionSyncMutationTask,
  subscribeCompanionHighValueMutation,
  subscribeCompanionSyncMutationRevision
} from './companionSyncMutationRevision';

it('keeps attachment streaming for private writes and yields after a committed syncable write', async () => {
  const shouldYield = attachmentWorkBudget(60_000);
  await runCompanionSyncMutationTask(async () => 'view saved', { kind: 'full' });
  expect(shouldYield()).toBe(false);
  await expect(runCompanionHighValueMutationTask(async () => {
    throw new Error('write failed');
  }, { kind: 'full' })).rejects.toThrow('write failed');
  expect(shouldYield()).toBe(false);
  await runCompanionHighValueMutationTask(async () => 'content saved', { kind: 'full' });
  expect(shouldYield()).toBe(true);
});

it('publishes a new revision only after a successful local mutation', async () => {
  const listener = vi.fn();
  const initialRevision = getCompanionSyncMutationRevision();
  const unsubscribe = subscribeCompanionSyncMutationRevision(listener);

  await expect(runCompanionSyncMutationTask(async () => 'saved', { kind: 'full' })).resolves.toBe('saved');
  expect(getCompanionSyncMutationRevision()).toBe(initialRevision + 1);
  expect(listener).toHaveBeenCalledTimes(1);

  await expect(runCompanionSyncMutationTask(async () => {
    throw new Error('not saved');
  }, { kind: 'full' })).rejects.toThrow('not saved');
  expect(getCompanionSyncMutationRevision()).toBe(initialRevision + 1);
  expect(listener).toHaveBeenCalledTimes(1);
  unsubscribe();
});

it('does not turn an observer error into a failed committed mutation', async () => {
  const unsubscribe = subscribeCompanionSyncMutationRevision(() => {
    throw new Error('observer failed');
  });

  await expect(runCompanionSyncMutationTask(async () => 'saved', { kind: 'full' })).resolves.toBe('saved');
  unsubscribe();
});

it('publishes a high-value trigger only after its permanent write succeeds', async () => {
  const listener = vi.fn();
  const unsubscribe = subscribeCompanionHighValueMutation(listener);

  await runCompanionHighValueMutationTask(async () => 'saved', { kind: 'full' });
  await expect(runCompanionHighValueMutationTask(async () => {
    throw new Error('write failed');
  }, { kind: 'full' })).rejects.toThrow('write failed');

  expect(listener).toHaveBeenCalledOnce();
  unsubscribe();
});


it('keeps rollback and old-library completions out of the display refresh queue', async () => {
  invalidateCompanionReadingScope();
  const read = vi.fn(async () => null);
  await expect(runCompanionHighValueMutationTask(async () => {
    throw new Error('rolled back');
  }, { kind: 'nodes', nodeIds: ['topic'] })).rejects.toThrow('rolled back');
  await companionWorkspaceSnapshots.refresh(read);
  expect(read).not.toHaveBeenCalled();
  await runCompanionHighValueMutationTask(async () => {
    invalidateCompanionReadingScope();
    return 'old library committed';
  }, { kind: 'nodes', nodeIds: ['topic'] });
  await companionWorkspaceSnapshots.refresh(read);
  expect(read).not.toHaveBeenCalled();
  await runCompanionHighValueMutationTask(async () => 'current committed', { kind: 'nodes', nodeIds: ['topic'] });
  await companionWorkspaceSnapshots.refresh(read);
  expect(read).toHaveBeenCalledExactlyOnceWith({ current: null, scope: { kind: 'nodes', nodeIds: ['topic'] } });
  invalidateCompanionReadingScope();
});
