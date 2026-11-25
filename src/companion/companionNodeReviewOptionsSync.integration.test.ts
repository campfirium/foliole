// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import type { DbPort } from '../../lib/core/sync/dbPort';
import { replayCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { companionFlowHistoryKey } from '../shared/platform/companion/runtime/companionFlowHistoryStore';
import { setCompanionNodeReviewOption } from '../shared/platform/companion/runtime/companionNodeReviewOptions';
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

it('synchronizes a phone branch override of desired retention and short-term steps, its undo and the restored inheritance', { meta: { calibratedMs: 20000 } }, async () => {
  const host = await createCompanionRequestFixture();
  const desktop = new Database(host.fixture.rightSnapshot.databasePath, { readonly: true });
  const id = 'review-options-folder';
  const now = '2026-10-01T00:00:00Z';
  const facts = (db: Database.Database) => db.prepare('SELECT desired_retention, enable_short_term, title FROM nodes WHERE id = ?').get(id);
  try {
    await applyCompanionLocalNodeVersions([await toWorkspaceNativeNodeVersion({
      id, kind: 'folder', parentNodeId: null, title: 'Folder', content: '',
      createdAt: now, updatedAt: now, isTitleManual: true, hideTitleHeading: false,
      anchorLink: null, reveal: null, review: null, reading: null
    }, 'Mobile', 'base-review-options-folder')]);
    await host.sync();
    expect(facts(desktop)).toEqual({ desired_retention: null, enable_short_term: null, title: 'Folder' });

    await setCompanionNodeReviewOption(id, { desiredRetention: 0.85 });
    await setCompanionNodeReviewOption(id, { enableShortTerm: true });
    const node = (await loadIosCompanionWorkspaceSnapshot(host.db))?.nodesById[id];
    expect(node).toMatchObject({ desiredRetention: 0.85, enableShortTerm: true });
    await host.sync();
    expect(facts(host.sqlite)).toEqual({ desired_retention: 0.85, enable_short_term: 1, title: 'Folder' });
    expect(facts(desktop)).toEqual(facts(host.sqlite));

    await replayCompanionFlowHistory(companionFlowHistoryKey('Mobile'), 'undo', createEmptyReviewSession());
    await host.sync();
    expect(facts(host.sqlite)).toEqual({ desired_retention: 0.85, enable_short_term: null, title: 'Folder' });
    expect(facts(desktop)).toEqual(facts(host.sqlite));

    await setCompanionNodeReviewOption(id, { enableShortTerm: false });
    await setCompanionNodeReviewOption(id, { desiredRetention: null });
    // A later metadata write that never edits the review options keeps them.
    await mutateCompanionWorkspace({ type: 'rename', nodeId: id, title: 'Renamed' });
    await host.sync();
    expect(facts(host.sqlite)).toEqual({ desired_retention: null, enable_short_term: 0, title: 'Renamed' });
    expect(facts(desktop)).toEqual(facts(host.sqlite));
  } finally {
    desktop.close();
    await host.close();
  }
});
