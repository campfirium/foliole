// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { createTrashLifecycleHarness } from '../test/workspaceTrashLifecycle.testSupport';

const apps: ReturnType<typeof createTrashLifecycleHarness>[] = [];
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); });

function setup(application = true) {
  const app = createTrashLifecycleHarness(application, false, false, [
    ['alpha', 'source', 'topic'], ['bravo', 'source', 'topic'], ['card', 'bravo', 'item'],
    ['charlie', 'source', 'item']
  ]);
  apps.push(app);
  app.set({ activeNodeId: 'bravo', browseRootNodeId: 'source' });
  return app;
}

function continuation(candidates: string[], overrides = {}) {
  return { activeNodeId: 'bravo', folderId: 'source', candidates,
    isCurrent: () => true, getListedIds: () => new Set(candidates), ...overrides };
}

async function replay(app: ReturnType<typeof setup>, mode: 'undo' | 'redo') {
  const result = mode === 'undo' ? app.applicationActions.undoApplicationOperation()
    : app.applicationActions.redoApplicationOperation();
  expect(result).toBe(true);
  await vi.waitFor(() => expect(app.get().appActionHistory.application?.requests).toEqual([]));
}

it('opens the next listed item and replays the same context through undo and redo', async () => {
  const app = setup();
  await app.remove(['bravo'], continuation(['charlie', 'alpha']));
  expect(app.get()).toMatchObject({ activeNodeId: 'charlie', browseRootNodeId: 'source' });
  expect(app.persisted().trashedNodeIds).toEqual(expect.arrayContaining(['bravo', 'card']));

  await replay(app, 'undo');
  expect(app.get()).toMatchObject({ activeNodeId: 'bravo', browseRootNodeId: 'source' });
  expect(app.persisted().trashedNodeIds).not.toContain('bravo');

  await replay(app, 'redo');
  expect(app.get()).toMatchObject({ activeNodeId: 'charlie', browseRootNodeId: 'source' });
  expect(app.persisted().trashedNodeIds).toContain('bravo');
});

it.each([
  { other: ['charlie'], expected: 'alpha' },
  { other: ['charlie', 'alpha'], expected: 'source' }
])('skips deleted candidates and opens $expected', async ({ other, expected }) => {
  const app = setup(false);
  await app.remove(['bravo', ...other], continuation(['charlie', 'alpha']));
  expect(app.get()).toMatchObject({ activeNodeId: expected, browseRootNodeId: 'source' });
  expect(app.persisted().trashedNodeIds).toEqual(expect.arrayContaining(['bravo', ...other]));
});

it('skips the next candidate when it has moved out of the folder', async () => {
  const app = setup(false);
  expect(await app.move(['charlie'], 'target', 'child')).toBe(true);
  await app.remove(['bravo'], continuation(['charlie', 'alpha']));
  expect(app.get().activeNodeId).toBe('alpha');
  expect(app.persisted().nodesById.charlie?.parentNodeId).toBe('target');
});

it('keeps the item selected during deletion of a different item, and returns from a child to its parent', async () => {
  const app = setup();
  await app.remove(['alpha']);
  expect(app.get().activeNodeId).toBe('bravo');
  app.set({ activeNodeId: 'card' });
  await app.remove(['card']);
  expect(app.get().activeNodeId).toBe('bravo');
  expect(app.persisted().trashedNodeIds).toEqual(expect.arrayContaining(['alpha', 'card']));
});

it('keeps a new selection while a deletion commits', async () => {
  const app = setup();
  const deletion = app.remove(['bravo'], continuation(['charlie']));
  app.set({ activeNodeId: 'target', browseRootNodeId: 'target' });
  await deletion;
  expect(app.get()).toMatchObject({ activeNodeId: 'target', browseRootNodeId: 'target' });
  expect(app.persisted().trashedNodeIds).toContain('bravo');
});

it('leaves the new folder active when the browse root changes during deletion', async () => {
  const app = setup();
  const deletion = app.remove(['bravo'], continuation(['charlie']));
  app.set({ browseRootNodeId: 'target' });
  await deletion;
  expect(app.get()).toMatchObject({ activeNodeId: null, browseRootNodeId: 'target' });
  expect(app.persisted().trashedNodeIds).toContain('bravo');
});

it('keeps the current item when deletion fails', async () => {
  const app = setup();
  app.driver.execute(`CREATE TRIGGER fail_delete BEFORE UPDATE OF deleted_at ON nodes
    WHEN NEW.deleted_at IS NOT NULL BEGIN SELECT RAISE(ABORT, 'delete_failed'); END`);
  await app.remove(['bravo'], continuation(['charlie', 'alpha']));
  expect(app.get().activeNodeId).toBe('bravo');
  expect(app.persisted().trashedNodeIds).not.toContain('bravo');
});
