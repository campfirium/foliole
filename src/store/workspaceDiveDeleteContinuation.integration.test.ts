// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { createDive, removeDiveSource } from '../../electron/database/diveRepository';
import { createTrashLifecycleHarness } from '../test/workspaceTrashLifecycle.testSupport';

const apps: ReturnType<typeof createTrashLifecycleHarness>[] = [];
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); });

function setup(sources = ['alpha', 'source', 'charlie']) {
  const app = createTrashLifecycleHarness(true, false, false, [
    ['alpha', 'target', 'topic'], ['bravo', 'source', 'topic'], ['charlie', 'target', 'topic']
  ]);
  apps.push(app);
  const { sqlite } = app;
  const { id } = createDive(sqlite, 'Reading Dive', sources);
  app.refresh([id]);
  app.set({ activeNodeId: 'bravo', browseRootNodeId: id });
  return { app, id, sqlite };
}

function removeCurrent(app: ReturnType<typeof setup>['app'], id: string, candidates = ['charlie', 'alpha']) {
  return app.remove(['bravo'], {
    activeNodeId: 'bravo', folderId: id, candidates,
    isCurrent: () => true, getListedIds: () => new Set(candidates)
  });
}

it('opens the next Dive member across folders and keeps the Dive through undo and redo', async () => {
  const { app, id } = setup();
  await removeCurrent(app, id);
  expect(app.get()).toMatchObject({ activeNodeId: 'charlie', browseRootNodeId: id });
  expect(app.persisted().trashedNodeIds).toContain('bravo');
  expect(app.persisted().nodesById[id]?.manualChildOrder).toEqual(['alpha', 'source', 'charlie']);

  for (const mode of ['undo', 'redo'] as const) {
    expect(mode === 'undo' ? app.applicationActions.undoApplicationOperation()
      : app.applicationActions.redoApplicationOperation()).toBe(true);
    await vi.waitFor(() => expect(app.get().appActionHistory.application?.requests).toEqual([]));
    expect(app.get()).toMatchObject({ activeNodeId: mode === 'undo' ? 'bravo' : 'charlie', browseRootNodeId: id });
    expect(app.persisted().trashedNodeIds.includes('bravo')).toBe(mode === 'redo');
  }
});

it('skips a removed Dive source even if it appears in the captured list', async () => {
  const { app, id, sqlite } = setup();
  removeDiveSource(sqlite, id, 'charlie');
  app.refresh([id]);
  await removeCurrent(app, id);
  expect(app.get()).toMatchObject({ activeNodeId: 'alpha', browseRootNodeId: id });
  expect(app.persisted().trashedNodeIds).not.toContain('charlie');
  expect(app.persisted().nodesById[id]?.manualChildOrder).toEqual(['alpha', 'source']);
});

it('opens the Dive itself when no listed member survives', async () => {
  const { app, id } = setup(['source']);
  await removeCurrent(app, id, []);
  expect(app.get()).toMatchObject({ activeNodeId: id, browseRootNodeId: id });
  expect(app.persisted().trashedNodeIds).toContain('bravo');
});
