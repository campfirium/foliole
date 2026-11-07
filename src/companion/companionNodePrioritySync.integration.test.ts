// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import type { DbPort } from '../../lib/core/sync/dbPort';
import { replayCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { companionFlowHistoryKey } from '../shared/platform/companion/runtime/companionFlowHistoryStore';
import { mutateCompanionWorkspace } from '../shared/platform/companion/runtime/companionWorkspaceMutations';
import { loadIosCompanionWorkspaceSnapshot } from '../shared/platform/companion/sync/workspace-state/iosCompanionWorkspaceSnapshotStore';
import { applyCompanionLocalNodeVersions } from '../shared/platform/companionSyncObjects';
import { createEmptyReviewSession } from '../store/workspaceReviewReading';
import { createCompanionRequestFixture, native } from '../test/companionRequestSync.testSupport';

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: vi.fn(() => ({}))
}));

vi.mock('../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap', async () => {
  const { CompanionNodePriorityState } = await import('../shared/platform/companion/runtime/companionNodePriorityState');
  const priorities = new CompanionNodePriorityState();
  const owner = {
    databasePath: '/fixture',
    get nodePriorityRevision() { return priorities.revision; },
    readNodePriorities: priorities.read.bind(priorities),
    readNodeIndex: priorities.readIndex.bind(priorities),
    readNodeOrder: priorities.readOrder.bind(priorities),
    readNodeMetadata: priorities.readMetadata.bind(priorities),
    refreshNodePriorities: (scope: Parameters<typeof priorities.refresh>[1], db = native.db!) => priorities.refresh(db, scope),
    clearNodePriorities: () => priorities.clear(),
    read: (task: (db: DbPort) => unknown) => task(native.db!),
    readSnapshot: (task: (db: DbPort) => unknown) => task(native.db!),
    runWriter: (task: (db: DbPort) => unknown) => task(native.db!)
  };
  return { getIosCompanionDatabaseOwner: () => owner };
});

it('keeps an offline Android priority after restart and synchronizes the override and undo', { meta: { calibratedMs: 20000 } }, async () => {
  const host = await createCompanionRequestFixture();
  const desktop = new Database(host.fixture.rightSnapshot.databasePath, { readonly: true });
  const id = 'priority-topic';
  const now = '2026-10-01T00:00:00Z';
  const facts = (db: Database.Database) => db.prepare('SELECT priority, content FROM nodes WHERE id = ?').get(id);
  try {
    await applyCompanionLocalNodeVersions([await toWorkspaceNativeNodeVersion({
      id, kind: 'topic', parentNodeId: null, title: 'Topic', content: 'Original body',
      createdAt: now, updatedAt: now, isTitleManual: true, hideTitleHeading: false,
      anchorLink: null, reveal: null, review: null, reading: null
    }, 'Mobile', 'base-priority-topic')]);
    await host.sync();
    expect(facts(desktop)).toEqual({ priority: null, content: 'Original body' });

    await mutateCompanionWorkspace({ type: 'set-priority', nodeId: id, priority: 0 });
    expect(facts(desktop)).toMatchObject({ priority: null });
    await host.restart();
    expect((await loadIosCompanionWorkspaceSnapshot(host.db))?.nodesById[id]?.priority).toBe(0);
    await host.sync();
    expect(facts(host.sqlite)).toEqual({ priority: 0, content: 'Original body' });
    expect(facts(desktop)).toEqual(facts(host.sqlite));

    await replayCompanionFlowHistory(companionFlowHistoryKey('Mobile'), 'undo', createEmptyReviewSession());
    await host.sync();
    expect(facts(host.sqlite)).toEqual({ priority: null, content: 'Original body' });
    expect(facts(desktop)).toEqual(facts(host.sqlite));
  } finally {
    desktop.close();
    await host.close();
  }
});
