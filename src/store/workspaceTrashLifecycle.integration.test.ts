// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { createTrashLifecycleHarness } from '../test/workspaceTrashLifecycle.testSupport';

import { isCanonicalVisibleNodeId } from './workspaceCanonicalSelectors';

const apps: ReturnType<typeof createTrashLifecycleHarness>[] = [];
afterEach(async () => { vi.useRealTimers(); for (const app of apps.splice(0)) await app.close(); });

function setup(application = false, subtree = false, persistedTrash = false) {
  const app = createTrashLifecycleHarness(application, subtree, persistedTrash);
  apps.push(app);
  return app;
}

function expectLifecycle(app: ReturnType<typeof setup>, deleted: boolean, ids = ['deleted']) {
  const current = app.get();
  const persisted = app.persisted();
  for (const id of ids) {
    expect(isCanonicalVisibleNodeId(current, id), `${id}: visible`).toBe(!deleted);
    expect(current.trashedNodeIds.includes(id), `${id}: trash`).toBe(deleted);
    expect(Boolean(current.nodesById[id]?.deletedAt), `${id}: lifecycle`).toBe(deleted);
    expect(Boolean(persisted.nodesById[id]?.deletedAt), `${id}: persisted lifecycle`).toBe(deleted);
    expect(persisted.nodeOrder.includes(id), `${id}: reopened traversal`).toBe(!deleted);
  }
}

it.each([false, true])('moves another root immediately after deletion without reviving it (application=%s)', async application => {
  const app = setup(application);
  await app.remove(['deleted']);
  expect(app.get().trashedNodeIds).toContain('deleted');
  expect(await app.move(['source'], 'target', 'child')).toBe(true);
  app.refresh();
  expectLifecycle(app, true);
  expect(app.get().nodesById.source?.parentNodeId).toBe('target');
  expect(app.persisted().nodesById.source?.parentNodeId).toBe('target');
});

it('keeps a deleted subtree hidden when an unrelated structure projection is merged', async () => {
  const app = setup(false, true);
  await app.remove(['deleted']);
  app.refresh();
  expectLifecycle(app, true, ['deleted', 'child']);
  expect(app.persisted().nodesById.child?.parentNodeId).toBe('deleted');
});

it.each([false, true])('retains a restored folder across another move and projection (application=%s)', async application => {
  const app = setup(application, true);
  await app.remove(['deleted']);
  expect(await app.restore('deleted')).toBe('deleted');
  expect(await app.move(['source'], 'target', 'child')).toBe(true);
  app.refresh();
  expectLifecycle(app, false, ['deleted', 'child']);
});

it('keeps delete undo and redo consistent across projections in the same instance', async () => {
  const app = setup();
  await app.remove(['deleted']);
  for (const mode of ['undo', 'redo', 'undo'] as const) {
    expect(await (mode === 'undo' ? app.history.undoWorkspaceAction() : app.history.redoWorkspaceAction())).toBe(true);
    app.refresh();
    expectLifecycle(app, mode === 'redo');
  }
});

it('preserves application restore undo and redo after loading a previously deleted folder', async () => {
  const app = setup(true, false, true);
  expect(await app.restore('deleted')).toBe('deleted');
  expect(app.persisted().nodeOrder.filter(id => ['deleted', 'source', 'target'].includes(id)))
    .toEqual(['deleted', 'source', 'target']);
  for (const mode of ['undo', 'redo', 'undo'] as const) {
    const actions = app.applicationActions;
    expect(mode === 'undo' ? actions.undoApplicationOperation() : actions.redoApplicationOperation()).toBe(true);
    await vi.waitFor(() => expect(app.get().appActionHistory.application?.requests).toEqual([]));
    app.refresh();
    expectLifecycle(app, mode === 'undo');
  }
});

it('does not publish a failed delete and keeps a failed restore in Trash', async () => {
  const app = setup();
  app.driver.execute(`CREATE TRIGGER fail_delete BEFORE UPDATE OF deleted_at ON nodes
    WHEN NEW.deleted_at IS NOT NULL BEGIN SELECT RAISE(ABORT, 'delete_failed'); END`);
  await app.remove(['deleted']);
  expectLifecycle(app, false);
  app.driver.execute('DROP TRIGGER fail_delete');
  await app.remove(['deleted']);
  app.driver.execute(`CREATE TRIGGER fail_restore BEFORE UPDATE OF deleted_at ON nodes
    WHEN NEW.deleted_at IS NULL BEGIN SELECT RAISE(ABORT, 'restore_failed'); END`);
  await expect(app.restore('deleted')).rejects.toThrow('restore_failed');
  app.refresh();
  expectLifecycle(app, true);
  app.driver.execute('DROP TRIGGER fail_restore');
  expect(await app.restore('deleted')).toBe('deleted');
  app.refresh();
  expectLifecycle(app, false);
});

it('replays application move and deletion without losing the deletion lifecycle', async () => {
  const app = setup(true);
  await app.remove(['deleted']);
  expect(await app.move(['source'], 'target', 'child')).toBe(true);
  for (const [mode, deleted] of [['undo', true], ['undo', false], ['redo', true]] as const) {
    expect(mode === 'undo' ? app.applicationActions.undoApplicationOperation()
      : app.applicationActions.redoApplicationOperation()).toBe(true);
    await vi.waitFor(() => expect(app.get().appActionHistory.application?.requests).toEqual([]));
    app.refresh();
    expectLifecycle(app, deleted);
  }
});

it('keeps an earlier tombstone when deleting and restoring its parent subtree', async () => {
  const app = setup(false, true);
  await app.remove(['child']);
  const deletedAt = app.get().nodesById.child?.deletedAt;
  await app.remove(['deleted']);
  app.refresh();
  expectLifecycle(app, true, ['deleted', 'child']);
  expect(app.get().nodesById.child?.deletedAt).toBe(deletedAt);
  expect(await app.history.undoWorkspaceAction()).toBe(true);
  app.refresh(['deleted']);
  expectLifecycle(app, false);
  expectLifecycle(app, true, ['child']);
});

it('leaves a conflicting imported duplicate in Trash when restore reuses its live copy', async () => {
  const app = setup();
  app.driver.execute(`UPDATE nodes SET import_source_fingerprint = 'source-key',
    import_content_fingerprint = 'content-key' WHERE id IN ('deleted', 'source')`);
  await app.remove(['deleted']);
  expect(await app.restore('deleted')).toBe('source');
  app.refresh();
  expectLifecycle(app, true);
  expect(app.get().activeNodeId).toBe('source');
});

it('uses the committed deletion time when the no-history receipt arrives later', async () => {
  const app = setup();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-16T09:00:00Z'));
  const persist = app.handlers.syncSoftDeleteNodes;
  app.handlers.syncSoftDeleteNodes = async payload => {
    const result = await persist(payload);
    vi.setSystemTime(new Date('2026-11-16T09:01:00Z'));
    return result;
  };
  await app.removeWithoutHistory(['deleted']);
  expect(app.get().trashedNodeDeletedAtById.deleted).toBe(app.persisted().nodesById.deleted?.deletedAt);
  expectLifecycle(app, true);
});
