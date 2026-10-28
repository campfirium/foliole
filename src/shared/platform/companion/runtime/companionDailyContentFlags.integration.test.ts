// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { toWorkspaceNativeNodeVersion } from '../../../../../lib/core/database/workspaceNodeSyncVersion';
import type { WorkspaceNodeSnapshot } from '../../../../../lib/core/database/workspaceSnapshotHelpers';
import { loadDailyFlowLearningSnapshot } from '../../../../../lib/core/flow/dailyFlowLearningSnapshot';
import { applyCompanionLocalNodeVersions } from '../../companionSyncNodeVersions';
import { refreshCompanionWorkspaceSnapshot } from '../companionWorkspaceSnapshotRefresh';
import { readCompanionContentSource, saveCompanionContentEdit } from '../editing/companionContentEditing';
import { runCompanionHighValueMutationTask } from '../sync/mutation/companionSyncMutationRevision';
import { createDisplayLibrary } from '../sync/workspace-state/companionDisplaySnapshotConcurrency.testSupport';

import type { CapacitorCompanionDatabaseOwner } from './capacitorCompanionDatabaseOwner';
import { openCompanionDailyFlow } from './companionDailyFlow';

const runtime = vi.hoisted(() => ({ owner: null as CapacitorCompanionDatabaseOwner | null }));
vi.mock('./iosCompanionDatabaseBootstrap', () => ({ getIosCompanionDatabaseOwner: () => runtime.owner! }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: () => ({})
}));
const now = '2026-10-28T08:00:00.000Z';
type Library = ReturnType<typeof createDisplayLibrary>;

async function snapshots(library: Library) {
  return library.owner.read(async db => {
    const cold = await loadDailyFlowLearningSnapshot(db, 'display-fixture');
    const warm = await loadDailyFlowLearningSnapshot(db, 'display-fixture', undefined, library.owner.readNodeMetadata(db)!);
    expect(warm).toEqual(cold);
    return warm.nodesById;
  });
}

async function generate(library: Library) {
  await library.owner.runWriter(async db => {
    await db.run('DELETE FROM daily_flow_state');
    await db.run('DELETE FROM daily_flow_entries');
    await db.run('DELETE FROM daily_flow_operations');
  });
  const opened = await openCompanionDailyFlow({ now, mode: 'reading-only' });
  const rows = await library.owner.read(db => db.query<{ node_id: string }>('SELECT node_id FROM daily_flow_entries ORDER BY order_key'));
  expect((await openCompanionDailyFlow({ now, mode: 'reading-only' })).session).toEqual(opened.session);
  return rows.map(row => row.node_id);
}

it.each(['android', 'ios'] as const)('%s preserves SQLite content flags, blob-only bodies and committed changes', async platform => {
  const library = createDisplayLibrary(platform);
  runtime.owner = library.owner;
  try {
    await library.owner.open({ expectedHostName: 'display-fixture', now });
    await library.owner.runWriter(async db => {
      for (const [id, content, blob, reveal] of [
        ['spaces', '   ', null, null], ['tab', '\t', null, ''], ['blob', '', 'body-reference', null]
      ] as const) await db.run(`INSERT INTO nodes (id,title,content,body_blob_hash,reveal,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?)`, [id, id, content, blob, reveal, now, now]);
    });
    const display = await refreshCompanionWorkspaceSnapshot();
    expect(display?.nodesById.blob?.hasContent).toBe(false);
    expect(display?.nodesById.blob?.bodyBlobHash).toBe('body-reference');
    const metadata = await library.owner.read(async db => library.owner.readNodeMetadata(db));
    expect(metadata?.get('blob')).not.toHaveProperty('bodyBlobHash');
    expect(metadata?.get('blob')).not.toHaveProperty('content');
    const before = await snapshots(library);
    expect(before.spaces).toMatchObject({ hasContent: false, hasReveal: false });
    expect(before.tab).toMatchObject({ hasContent: true, hasReveal: true });
    expect(before.blob).toMatchObject({ hasContent: true, hasReveal: false });
    expect((await generate(library)).sort()).toEqual(['blob', 'tab']);
    const scope = { kind: 'nodes' as const, nodeIds: ['spaces', 'tab'] };
    await runCompanionHighValueMutationTask(() => library.owner.runWriter(db => db.transaction(async tx => {
      await tx.run("UPDATE nodes SET content='Now complete', reveal='' WHERE id='spaces'");
      await tx.run("UPDATE nodes SET content=' ', reveal=NULL WHERE id='tab'");
    })), scope);
    expect((await snapshots(library)).spaces).toMatchObject({ hasContent: true, hasReveal: true });
    expect((await generate(library)).sort()).toEqual(['blob', 'spaces']);
    await expect(runCompanionHighValueMutationTask(() => library.owner.runWriter(db => db.transaction(async tx => {
      await tx.run("UPDATE nodes SET content='', reveal=NULL WHERE id='spaces'");
      throw new Error('rejected content');
    })), scope)).rejects.toThrow('rejected content');
    expect((await snapshots(library)).spaces).toMatchObject({ hasContent: true, hasReveal: true });
    library.owner.clearNodePriorities();
    await refreshCompanionWorkspaceSnapshot();
    expect((await generate(library)).sort()).toEqual(['blob', 'spaces']);
  } finally { await library.close(); runtime.owner = null; }
});

it.each(['android', 'ios'] as const)('%s refreshes answer existence after actual item editing', async platform => {
  const library = createDisplayLibrary(platform);
  runtime.owner = library.owner;
  try {
    await library.owner.open({ expectedHostName: 'display-fixture', now });
    const node: WorkspaceNodeSnapshot = { id: 'item', parentNodeId: null, kind: 'item', title: 'Question',
      content: 'Question', reveal: null, anchorLink: null, reading: null, review: null,
      isTitleManual: true, hideTitleHeading: false, createdAt: now, updatedAt: now };
    await applyCompanionLocalNodeVersions([await toWorkspaceNativeNodeVersion(node, 'fixture', 'seed-item')]);
    await refreshCompanionWorkspaceSnapshot();
    expect((await snapshots(library)).item?.hasReveal).toBe(false);
    for (const [index, reveal] of ['', 'Complete answer', null].entries()) {
      const source = await readCompanionContentSource('item');
      const saved = await saveCompanionContentEdit({ nodeId: 'item', baseVersionId: source.versionId,
        versionId: `edit-${index}`, content: 'Question', reveal, updatedAt: now });
      expect(saved.reveal).toBe(reveal);
      expect((await snapshots(library)).item?.hasReveal).toBe(reveal !== null);
      expect((await readCompanionContentSource('item')).content).toBe('Question');
    }
  } finally { await library.close(); runtime.owner = null; }
});
