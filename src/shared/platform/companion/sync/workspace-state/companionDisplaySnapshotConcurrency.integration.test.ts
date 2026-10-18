// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { COMPANION_CONTENT_SNAPSHOT_SQL } from '../../../../../../lib/core/database/companionContentSnapshotQuery';
import { toWorkspaceNativeNodeVersion } from '../../../../../../lib/core/database/workspaceNodeSyncVersion';
import type { WorkspaceNodeSnapshot } from '../../../../../../lib/core/database/workspaceSnapshotHelpers';
import { applySyncNodesWithDbPort } from '../../../../../../lib/core/sync/syncNodeApplyExecutor';
import { loadCompanionStateAfterStructureSyncReport } from '../../../../../companion/companionStructureSyncSnapshot';
import { refreshCompanionWorkspaceAfterMutation } from '../../companionWorkspaceRepository';
import { refreshCompanionWorkspaceSnapshot } from '../../companionWorkspaceSnapshotRefresh';
import { companionWorkspaceSnapshots } from '../../companionWorkspaceSnapshotStore';
import { saveCompanionContentEdit } from '../../editing/companionContentEditing';
import type { CapacitorCompanionDatabaseOwner } from '../../runtime/capacitorCompanionDatabaseOwner';
import { runCompanionHighValueMutationTask, runCompanionSyncMutationTask } from '../mutation/companionSyncMutationRevision';

import { createDisplayLibrary } from './companionDisplaySnapshotConcurrency.testSupport';

it('reuses the committed snapshot before grading and reads registered mutations afterwards', async () => {
  const library = createDisplayLibrary('android');
  runtime.owner = library.owner;
  try {
    await library.owner.open({ expectedHostName: 'display-fixture', now: '2026-10-18T00:00:00Z' });
    await library.owner.runWriter(db => db.run(`INSERT INTO nodes
      (id, title, content, created_at, updated_at) VALUES ('topic', 'Before', 'Body', 'now', 'now')`));
    const before = await refreshCompanionWorkspaceAfterMutation();
    const reads = library.directoryQueries();
    expect(await refreshCompanionWorkspaceAfterMutation()).toBe(before);
    expect(library.directoryQueries()).toBe(reads);
    await runCompanionHighValueMutationTask(() => library.owner.runWriter(db => db.run(
      "UPDATE nodes SET title = 'After' WHERE id = 'topic'")));
    const after = await refreshCompanionWorkspaceAfterMutation();
    expect(after?.nodesById.topic?.title).toBe('After');
    expect(library.directoryQueries()).toBe(reads + 1);
  } finally { await library.close(); }
});

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true },
  registerPlugin: () => ({})
}));

const runtime = vi.hoisted(() => ({ owner: null as CapacitorCompanionDatabaseOwner | null }));
vi.mock('../../runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => runtime.owner!
}));

it.each([
  { platform: 'android', origin: 'remote' }, { platform: 'ios', origin: 'remote' },
  { platform: 'android', origin: 'local' }, { platform: 'ios', origin: 'local' }
] as const)('$platform commits new text during a $origin display refresh', async ({ platform, origin }) => {
  const library = createDisplayLibrary(platform);
  const { owner, file, reading, release } = library;
  runtime.owner = owner;
  let snapshot: ReturnType<typeof refreshCompanionWorkspaceAfterMutation> | undefined;
  let write: Promise<unknown> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await owner.open({ expectedHostName: 'display-fixture', now: '2026-10-18T00:00:00Z' });
    await owner.runWriter(db => db.run(`INSERT INTO nodes
      (id, title, content, created_at, updated_at) VALUES ('topic', 'Before', 'Old text', 'now', 'now')`));
    library.hold();
    snapshot = origin === 'remote'
      ? loadCompanionStateAfterStructureSyncReport().then(report => report.state?.workspace_snapshot ?? null)
      : refreshCompanionWorkspaceAfterMutation();
    await reading.promise;
    write = owner.runWriter(db => db.transaction(tx => tx.run(
      "UPDATE nodes SET title = 'After', content = 'New text' WHERE id = 'topic'")));
    const committedBeforeDisplay = await Promise.race([
      write.then(() => true),
      new Promise<false>(done => { timeout = setTimeout(() => done(false), 500); })
    ]);
    const observer = new Database(file, { readonly: true });
    const persisted = observer.prepare("SELECT content FROM nodes WHERE id = 'topic'").pluck().get();
    observer.close();
    release.resolve();
    const displayed = await snapshot;
    await write;
    expect(committedBeforeDisplay, 'Display refresh must not own the writer queue').toBe(true);
    expect(persisted).toBe('New text');
    expect(displayed?.nodesById.topic?.title).toBe('Before');
  } finally {
    clearTimeout(timeout);
    release.resolve();
    await Promise.allSettled([snapshot, write]);
    await library.close();
    runtime.owner = null;
  }
});

it('matches a complete snapshot after saving text that removes a child anchor target', async () => {
  const library = createDisplayLibrary('android');
  runtime.owner = library.owner;
  const now = '2026-10-18T00:00:00Z';
  const topic: WorkspaceNodeSnapshot = { id: 'topic', kind: 'topic', parentNodeId: null,
    title: 'Original title', content: 'Apples\nBread\nMilk\n', isTitleManual: false,
    hideTitleHeading: false, reveal: null, anchorLink: null, reading: null, review: null,
    createdAt: now, updatedAt: now };
  const child: WorkspaceNodeSnapshot = { ...topic, id: 'child', kind: 'item', parentNodeId: 'topic',
    content: 'Child note', anchorLink: { id: 'anchor', kind: 'highlight',
      locator: { from: 7, to: 12, originalText: 'Bread' } } };
  try {
    await library.owner.open({ expectedHostName: 'display-fixture', now });
    for (const node of [topic, child, { ...topic, id: 'grandchild', parentNodeId: 'child' }]) {
      const record = await toWorkspaceNativeNodeVersion(node, 'remote', `${node.id}-base`);
      await library.owner.runWriter(db => applySyncNodesWithDbPort(db, [record], { enqueueSearchInvalidations: false }));
    }
    const before = await refreshCompanionWorkspaceAfterMutation();
    await saveCompanionContentEdit({ nodeId: 'topic', baseVersionId: 'topic-base', versionId: 'edited',
      content: '# New heading\nApples\nMilk\n', updatedAt: '2026-10-18T01:00:00Z' });
    const refreshed = await refreshCompanionWorkspaceAfterMutation(before, 'topic');
    const complete = await refreshCompanionWorkspaceSnapshot({ kind: 'full' });
    expect(refreshed).toEqual(complete);
    expect(complete!.nodesById.child!.deletedAt).toBeFalsy();
    expect(complete!.nodeOrder).toEqual(expect.arrayContaining(['child', 'grandchild']));
    expect(complete!.nodesById.grandchild).toEqual(before!.nodesById.grandchild);
  } finally {
    await library.close();
    runtime.owner = null;
  }
});


it('refreshes edited topic projections without transferring unrelated directory rows', async () => {
  const library = createDisplayLibrary('android');
  runtime.owner = library.owner;
  try {
    await library.owner.open({ expectedHostName: 'display-fixture', now: '2026-10-18T00:00:00Z' });
    await library.owner.runWriter(db => db.run(`WITH RECURSIVE series(n) AS (
      VALUES(1) UNION ALL SELECT n + 1 FROM series WHERE n < 30000
    ) INSERT INTO nodes (id, title, content, created_at, updated_at)
      SELECT 'node-' || n, 'Topic ' || n, 'Old text', 'now', 'now' FROM series`));
    await library.owner.runWriter(db => db.run(
      "UPDATE nodes SET parent_id = 'node-1' WHERE id = 'node-2'"));
    const before = await refreshCompanionWorkspaceAfterMutation();
    await library.owner.runWriter(db => db.run(
      "UPDATE nodes SET content = '', opening_text = 'Changed body' WHERE id IN ('node-1', 'node-2')"));
    const plan = await library.owner.read(db => db.query(`EXPLAIN QUERY PLAN ${COMPANION_CONTENT_SNAPSHOT_SQL}`,
      ['["node-1"]', '["node-1"]', 'display-fixture']));
    expect(plan.some(row => /\bSCAN(?: TABLE)? (?:nodes|n|owner)\b/u.test(String(row.detail)))).toBe(false);
    const start = library.directoryRows();
    const refreshed = await refreshCompanionWorkspaceAfterMutation(before, 'node-1');
    const transferred = library.directoryRows() - start;
    expect(library.projectionPlans().map(plan => plan.kind)).toEqual(['nodes', 'attachments']);
    for (const plan of library.projectionPlans()) {
      expect(plan.details.filter(detail => /\bSCAN(?: TABLE)? (?:nodes|n|owner)\b/u.test(detail)), plan.kind).toEqual([]);
    }
    const complete = await refreshCompanionWorkspaceSnapshot({ kind: 'full' });
    expect(refreshed).toEqual(complete);
    expect(transferred, 'One content edit must not transfer the whole directory').toBeLessThanOrEqual(2);
    const ids = Array.from({ length: 600 }, (_, index) => `node-${index + 1}`);
    await runCompanionHighValueMutationTask(() => library.owner.runWriter(db => db.run(
      "UPDATE nodes SET opening_text = 'Batch edited' WHERE id IN (SELECT value FROM json_each(?))",
      [JSON.stringify(ids)])), { kind: 'nodes', nodeIds: ids });
    const queriesBefore = library.directoryQueries();
    const rowsBefore = library.directoryRows();
    const batch = await refreshCompanionWorkspaceSnapshot();
    expect(library.directoryQueries() - queriesBefore, 'A batch must use one directory query').toBe(1);
    expect(library.directoryRows() - rowsBefore).toBe(600);
    expect(batch).toEqual(await refreshCompanionWorkspaceSnapshot({ kind: 'full' }));
    const unchanged = companionWorkspaceSnapshots.getSnapshot();
    const listener = vi.fn();
    const unsubscribe = companionWorkspaceSnapshots.subscribe(listener);
    try {
      expect(await refreshCompanionWorkspaceSnapshot({ kind: 'nodes', nodeIds: ids })).toBe(unchanged);
      expect(listener).not.toHaveBeenCalled();
    } finally { unsubscribe(); }
  } finally {
    await library.close();
    runtime.owner = null;
  }
});


it.each(['insert', 'delete', 'move', 'restore', 'reference', 'order'] as const)('uses a complete snapshot for a concurrent child %s', async action => {
  const library = createDisplayLibrary('android');
  runtime.owner = library.owner;
  try {
    await library.owner.open({ expectedHostName: 'display-fixture', now: '2026-10-18T00:00:00Z' });
    await library.owner.runWriter(db => db.run(`INSERT INTO nodes
      (id, parent_id, title, content, created_at, updated_at) VALUES
      ('topic', NULL, 'Topic', 'Body', 'now', 'now'),
      ('child', 'topic', 'Child', 'Body', 'now', 'now')`));
    if (action === 'restore') await library.owner.runWriter(db => db.run(
      "UPDATE nodes SET deleted_at = 'earlier' WHERE id = 'child'"));
    const before = await refreshCompanionWorkspaceAfterMutation();
    await library.owner.runWriter(db => db.run(action === 'insert'
      ? "INSERT INTO nodes (id, parent_id, title, content, created_at, updated_at) VALUES ('new', 'topic', 'New', 'Body', 'now', 'now')"
      : action === 'delete' ? "UPDATE nodes SET deleted_at = 'later' WHERE id = 'child'"
      : action === 'restore' ? "UPDATE nodes SET deleted_at = NULL WHERE id = 'child'"
      : action === 'reference' ? `UPDATE nodes SET resource_references = '[{"storage_key":"${'a'.repeat(64)}.png","role":"image","original_name":null}]' WHERE id = 'child'`
      : action === 'order' ? `UPDATE nodes SET manual_child_order = '["child"]' WHERE id = 'topic'`
        : "UPDATE nodes SET parent_id = NULL WHERE id = 'child'"));
    const actual = await refreshCompanionWorkspaceAfterMutation(before, 'topic');
    const complete = await refreshCompanionWorkspaceSnapshot({ kind: 'full' });
    expect(actual).toEqual(complete);
  } finally {
    await library.close();
    runtime.owner = null;
  }
});


it('publishes a local projection then a concurrent remote structural commit without losing either', async () => {
  const library = createDisplayLibrary('android');
  runtime.owner = library.owner;
  const published: string[] = [];
  let work: Promise<unknown> | undefined;
  let unsubscribe = () => {};
  try {
    await library.owner.open({ expectedHostName: 'display-fixture', now: '2026-10-18T00:00:00Z' });
    await library.owner.runWriter(db => db.run(`INSERT INTO nodes
      (id, title, content, created_at, updated_at) VALUES ('topic', 'Original', 'Body', 'now', 'now')`));
    await refreshCompanionWorkspaceSnapshot({ kind: 'full' });
    await runCompanionHighValueMutationTask(() => library.owner.runWriter(db => db.run(
      "UPDATE nodes SET opening_text = 'Local edit' WHERE id = 'topic'")), { kind: 'nodes', nodeIds: ['topic'] });
    library.hold();
    unsubscribe = companionWorkspaceSnapshots.subscribe(() => {
      const snapshot = companionWorkspaceSnapshots.getSnapshot();
      published.push(snapshot?.nodesById.topic?.title ?? 'empty');
    });
    work = refreshCompanionWorkspaceSnapshot();
    await library.reading.promise;
    await runCompanionSyncMutationTask(() => library.owner.runWriter(db => db.transaction(async tx => {
      await tx.run("UPDATE nodes SET title = 'Remote title' WHERE id = 'topic'");
      await tx.run(`INSERT INTO nodes (id, parent_id, title, content, created_at, updated_at)
        VALUES ('remote-child', 'topic', 'Child', 'Body', 'now', 'now')`);
    })));
    library.release.resolve();
    await work;
    expect(published).toEqual(['Original', 'Remote title']);
    const final = companionWorkspaceSnapshots.getSnapshot();
    expect(final?.nodesById.topic?.openingText).toBe('Local edit');
    expect(final?.nodeOrder).toContain('remote-child');
    expect(final).toEqual(await refreshCompanionWorkspaceSnapshot({ kind: 'full' }));
  } finally {
    library.release.resolve();
    await work;
    unsubscribe();
    await library.close();
    runtime.owner = null;
  }
});
