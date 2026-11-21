// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { loadVisibleWorkspaceNodeOrder } from '../../lib/core/database/workspaceVisibleNodeOrder';
import { createTrashLifecycleHarness } from '../test/workspaceTrashLifecycle.testSupport';

// Work-amplification check: counts whole-library order reads, never durations.
const reads = vi.hoisted(() => ({ orderMembers: 0 }));
vi.mock('../../lib/core/database/parentChildOrder', async importOriginal => {
  const original = await importOriginal<typeof import('../../lib/core/database/parentChildOrder')>();
  return { ...original, readOrderMembers: (...args: Parameters<typeof original.readOrderMembers>) => {
    reads.orderMembers += 1;
    return original.readOrderMembers(...args);
  } };
});

type Seed = [id: string, parent: string | null, kind?: 'folder' | 'topic' | 'item'];
const apps: ReturnType<typeof createTrashLifecycleHarness>[] = [];
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); });

function library(application = false) {
  const seeds: Seed[] = [];
  for (let f = 0; f < 6; f += 1) {
    seeds.push([`f${f}`, null, 'folder']);
    for (let t = 0; t < 3; t += 1) {
      seeds.push([`f${f}t${t}`, `f${f}`, 'topic']);
      for (let i = 0; i < 2; i += 1) seeds.push([`f${f}t${t}i${i}`, `f${f}t${t}`, 'item']);
    }
  }
  const app = createTrashLifecycleHarness(application, true, false, seeds);
  apps.push(app);
  // As after a hydrate: the list order the renderer holds is the stored one.
  app.set({ nodeOrder: loadVisibleWorkspaceNodeOrder(app.driver) });
  return app;
}

function expectCompleteReread(app: ReturnType<typeof library>) {
  expect(reads.orderMembers).toBe(0);
  // System entries keep the place the renderer gives them; every stored node follows the stored order.
  const stored = (order: string[]) => order.filter(id => !id.startsWith('special-'));
  expect(stored(app.get().nodeOrder)).toEqual(stored(loadVisibleWorkspaceNodeOrder(app.driver)));
  expect(stored(app.get().nodeOrder)).toEqual(stored(app.persisted().nodeOrder));
}

it.each([['a nested topic', 'f3t1'], ['a root folder', 'f2'], ['the last root folder', 'f5']])(
  'restores %s into its place without reading the whole library', async (_label, nodeId) => {
    const app = library();
    await app.remove([nodeId]);
    reads.orderMembers = 0;
    expect(await app.restore(nodeId)).toBe(nodeId);
    expect(app.get().trashedNodeIds).toEqual([]);
    expectCompleteReread(app);
  });

it('restores a node whose siblings stay in Trash without showing them', async () => {
  const app = library();
  await app.remove(['f3t0']);
  await app.remove(['f3t2']);
  await app.remove(['f3t1']);
  reads.orderMembers = 0;
  await app.restore('f3t1');
  expect(app.get().trashedNodeIds).toEqual(expect.arrayContaining(['f3t0', 'f3t2']));
  expectCompleteReread(app);
});

it('undoes a move to Trash into its place without reading the whole library', async () => {
  const app = library();
  await app.remove(['f3t1']);
  reads.orderMembers = 0;
  expect(await app.history.undoWorkspaceAction()).toBe(true);
  expect(app.get().trashedNodeIds).toEqual([]);
  expectCompleteReread(app);
});

it('undoes an application move to Trash into its place without reading the whole library', async () => {
  const app = library(true);
  await app.remove(['f3t1']);
  await vi.waitFor(() => expect(app.get().appActionHistory.application?.requests).toEqual([]));
  reads.orderMembers = 0;
  expect(app.applicationActions.undoApplicationOperation()).toBe(true);
  await vi.waitFor(() => expect(app.get().appActionHistory.application?.requests).toEqual([]));
  expect(app.get().trashedNodeIds).toEqual([]);
  expectCompleteReread(app);
});
