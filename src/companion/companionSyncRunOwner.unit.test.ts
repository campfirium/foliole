import { describe, expect, it } from 'vitest';

import { runCompanionSyncAsOwner } from './companionSyncRunOwner';

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe('companion sync run handles', () => {
  it('returns the active run identity to a duplicate request', async () => {
    const work = deferred<string>();
    const owner = runCompanionSyncAsOwner('http://desktop:38641', 'run-owner', () => work.promise);
    const duplicate = runCompanionSyncAsOwner(
      'http://desktop:38641', 'run-unused', async () => 'must-not-run'
    );

    expect(owner).toMatchObject({ mode: 'owned', runId: 'run-owner' });
    expect(duplicate).toMatchObject({ mode: 'joined', runId: 'run-owner' });
    work.resolve('completed');
    await expect(owner.completion).resolves.toBe('completed');
    await expect(duplicate.completion).resolves.toBe('completed');
  });

  it('shares owner failure with joiners and releases the endpoint afterward', async () => {
    const work = deferred<string>();
    const owner = runCompanionSyncAsOwner('http://desktop:38642', 'run-failed', () => work.promise);
    const joined = runCompanionSyncAsOwner('http://desktop:38642', 'run-unused', async () => 'unused');
    work.reject(new Error('sync failed'));

    await expect(owner.completion).rejects.toThrow('sync failed');
    await expect(joined.completion).rejects.toThrow('sync failed');
    const next = runCompanionSyncAsOwner('http://desktop:38642', 'run-next', async () => 'next');
    expect(next).toMatchObject({ mode: 'owned', runId: 'run-next' });
    await expect(next.completion).resolves.toBe('next');
  });
});
