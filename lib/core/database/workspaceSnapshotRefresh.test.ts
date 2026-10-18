import { expect, it } from 'vitest';

import { WorkspaceSnapshotRefresh, type WorkspaceRefreshScope } from './workspaceSnapshotRefresh.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

it('publishes intermediate results without consuming later changes to the same node', async () => {
  const reads = [deferred<string>(), deferred<string>()];
  const scopes: WorkspaceRefreshScope[] = [];
  const published: string[] = [];
  const store = new WorkspaceSnapshotRefresh('initial', ({ scope }) => {
    scopes.push(scope);
    return reads[scopes.length - 1]!.promise;
  });
  store.subscribe(() => published.push(store.getSnapshot()));
  store.register({ kind: 'nodes', nodeIds: ['topic'] });
  const work = store.refresh();
  store.register({ kind: 'nodes', nodeIds: ['topic'] });
  expect(store.refresh()).toBe(work);
  expect(scopes).toHaveLength(1);
  reads[0]!.resolve('first');
  await Promise.resolve();
  expect(published).toEqual(['first']);
  expect(scopes).toEqual(Array(2).fill({ kind: 'nodes', nodeIds: ['topic'] }));
  reads[1]!.resolve('second');
  await work;
  expect(published).toEqual(['first', 'second']);
});

it('keeps a full refresh registered while an earlier full refresh is reading', async () => {
  const first = deferred<string>();
  const scopes: WorkspaceRefreshScope[] = [];
  const store = new WorkspaceSnapshotRefresh('initial', async ({ scope }) => {
    scopes.push(scope);
    return scopes.length === 1 ? first.promise : 'latest';
  });
  store.register({ kind: 'full' });
  const work = store.refresh();
  store.register({ kind: 'nodes', nodeIds: ['a', 'b'] });
  store.register({ kind: 'full' });
  first.resolve('earlier');
  await work;
  expect(scopes).toEqual([{ kind: 'full' }, { kind: 'full' }]);
  expect(store.getSnapshot()).toBe('latest');
});

it('drops old-library results and reads the newly registered library', async () => {
  const old = deferred<string>();
  let calls = 0;
  const published: string[] = [];
  const store = new WorkspaceSnapshotRefresh('old', async () => ++calls === 1 ? old.promise : 'new loaded');
  store.subscribe(() => published.push(store.getSnapshot()));
  store.register({ kind: 'full' });
  const work = store.refresh();
  store.reset('new empty');
  store.register({ kind: 'full' });
  old.resolve('old loaded');
  await work;
  expect(published).toEqual(['new empty', 'new loaded']);
});

it('retains failed and later scopes for an explicit retry', async () => {
  const first = deferred<string>();
  const scopes: WorkspaceRefreshScope[] = [];
  const store = new WorkspaceSnapshotRefresh('initial', async ({ scope }) => {
    scopes.push(scope);
    return scopes.length === 1 ? first.promise : 'recovered';
  });
  store.register({ kind: 'nodes', nodeIds: ['a'] });
  const work = store.refresh();
  store.register({ kind: 'nodes', nodeIds: ['b'] });
  first.reject(new Error('read failed'));
  await expect(work).rejects.toThrow('read failed');
  expect(store.getSnapshot()).toBe('initial');
  await store.refresh();
  expect(scopes[1]).toEqual({ kind: 'nodes', nodeIds: ['a', 'b'] });
  expect(store.getSnapshot()).toBe('recovered');
});

it('does not lose a refresh registered by a publication observer', async () => {
  let reads = 0;
  const store = new WorkspaceSnapshotRefresh(0, async () => ++reads);
  store.subscribe(() => {
    if (store.getSnapshot() < 5) store.register({ kind: 'nodes', nodeIds: ['topic'] });
  });
  store.subscribe(() => { throw new Error('observer failed'); });
  store.register({ kind: 'full' });
  await store.refresh();
  expect(store.getSnapshot()).toBe(5);
  expect(reads).toBe(5);
});


it('invalidates derived results whose baseline is replaced by an in-flight read', async () => {
  const read = deferred<string>();
  const published: string[] = [];
  const store = new WorkspaceSnapshotRefresh('before', () => read.promise);
  store.subscribe(() => published.push(store.getSnapshot()));
  store.register({ kind: 'full' });
  const work = store.refresh();
  const derived = store.updateDerived('before', current => current + ' virtual results');
  expect(published).toEqual([]);
  read.resolve('after');
  await work;
  expect(await derived).toBe(false);
  expect(published).toEqual(['after']);
  expect(await store.updateDerived('after', current => current + ' current results')).toBe(true);
  expect(store.getSnapshot()).toBe('after current results');
});


it('drains a commit registered between the last publication and refresh completion', async () => {
  let reads = 0;
  const store = new WorkspaceSnapshotRefresh(0, async () => ++reads);
  store.subscribe(() => {
    if (store.getSnapshot() === 1) queueMicrotask(() => {
      store.register({ kind: 'nodes', nodeIds: ['late'] });
      void store.refresh();
    });
  });
  store.register({ kind: 'full' });
  await store.refresh();
  expect(store.getSnapshot()).toBe(2);
});
