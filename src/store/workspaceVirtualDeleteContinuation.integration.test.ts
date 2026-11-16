// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations';
import { createManualVirtualNodeFilter, type VirtualNodeFilter } from '../../lib/core/nodes/virtualNodeFilter';
import { VIRTUAL_PUBLISHED_NODE_ID, VIRTUAL_ROOT_NODE_ID, VIRTUAL_SHELVED_NODE_ID } from '../features/nodes/model/specialNodes';
import { createTrashLifecycleHarness } from '../test/workspaceTrashLifecycle.testSupport';

const apps: ReturnType<typeof createTrashLifecycleHarness>[] = [];
const virtualId = 'virtual-continuation';
const time = '2026-11-16T08:00:00.000Z';
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); });

function setup() {
  const app = createTrashLifecycleHarness(true, false, false, [
    ['alpha', 'target', 'topic'], ['bravo', 'source', 'topic'], ['charlie', 'target', 'topic']
  ]);
  apps.push(app);
  return app;
}

function saveVirtual(app: ReturnType<typeof setup>, filter: VirtualNodeFilter, ids: string[], updatedAt = time) {
  upsertNodeSnapshot(app.driver, { nodeId: virtualId, parentNodeId: VIRTUAL_ROOT_NODE_ID,
    hostName: 'trash-lifecycle', kind: 'folder', title: 'Test results', isTitleManual: true, content: '', anchorLink: null,
    reveal: null, position: null, createdAt: time, updatedAt, virtualFilter: filter, manualChildOrder: ids });
  app.refresh([virtualId]);
}

function removeCurrent(app: ReturnType<typeof setup>, folderId: string, candidates: string[]) {
  return app.remove(['bravo'], {
    activeNodeId: 'bravo', folderId, candidates,
    isCurrent: () => true, getListedIds: () => new Set(candidates)
  });
}

it('uses cross-folder manual references and skips a removed reference still in the captured order', async () => {
  const app = setup();
  const filter = createManualVirtualNodeFilter();
  saveVirtual(app, filter, ['source', 'charlie', 'alpha']);
  app.set({ activeNodeId: 'bravo', browseRootNodeId: virtualId });
  saveVirtual(app, filter, ['source', 'alpha'], '2026-11-16T08:00:01.000Z');
  await removeCurrent(app, virtualId, ['charlie', 'alpha']);
  expect(app.get()).toMatchObject({ activeNodeId: 'alpha', browseRootNodeId: virtualId });
  expect(app.persisted().trashedNodeIds).toContain('bravo');
  expect(app.persisted().trashedNodeIds).not.toContain('charlie');
});

it('selects the next result for a saved filter using the current condition', async () => {
  const app = setup();
  const filter = { version: 1, match: 'all', conditions: [{ field: 'text', operator: 'contains', value: 'a' }] } as const;
  saveVirtual(app, { ...filter, conditions: [...filter.conditions] }, []);
  app.set({ activeNodeId: 'bravo', browseRootNodeId: virtualId });
  saveVirtual(app, { ...filter, conditions: [{ ...filter.conditions[0], value: 'alpha' }] }, [], '2026-11-16T08:00:01.000Z');
  await removeCurrent(app, virtualId, ['charlie', 'alpha']);
  expect(app.get()).toMatchObject({ activeNodeId: 'alpha', browseRootNodeId: virtualId });
  expect(app.persisted().trashedNodeIds).toContain('bravo');
});

it.each([virtualId, VIRTUAL_SHELVED_NODE_ID, VIRTUAL_PUBLISHED_NODE_ID])(
  'keeps empty view %s with no selected material through undo and redo',
  async folderId => {
    const app = setup();
    if (folderId === virtualId) saveVirtual(app, createManualVirtualNodeFilter(), ['bravo']);
    app.set({ activeNodeId: 'bravo', browseRootNodeId: folderId });
    await removeCurrent(app, folderId, []);
    expect(app.get()).toMatchObject({ activeNodeId: null, browseRootNodeId: folderId });
    for (const mode of ['undo', 'redo'] as const) {
      expect(mode === 'undo' ? app.applicationActions.undoApplicationOperation()
        : app.applicationActions.redoApplicationOperation()).toBe(true);
      await vi.waitFor(() => expect(app.get().appActionHistory.application?.requests).toEqual([]));
      expect(app.get()).toMatchObject({ activeNodeId: mode === 'undo' ? 'bravo' : null, browseRootNodeId: folderId });
      expect(app.persisted().trashedNodeIds.includes('bravo')).toBe(mode === 'redo');
    }
  }
);
