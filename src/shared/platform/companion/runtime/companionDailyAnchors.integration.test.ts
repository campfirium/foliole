// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { toWorkspaceNativeNodeVersion } from '../../../../../lib/core/database/workspaceNodeSyncVersion';
import type { WorkspaceNodeSnapshot } from '../../../../../lib/core/database/workspaceSnapshotHelpers';
import { loadDailyFlowLearningSnapshot } from '../../../../../lib/core/flow/dailyFlowLearningSnapshot';
import { applyCompanionLocalNodeVersions, applyCompanionSyncNodeVersions } from '../../companionSyncNodeVersions';
import { refreshCompanionWorkspaceSnapshot } from '../companionWorkspaceSnapshotRefresh';
import { holdCompanionSyncAppliedRefresh } from '../companionWorkspaceSnapshotStore';
import { readCompanionContentSource } from '../editing/companionContentEditing';
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

async function anchors(library: Library) {
  return library.owner.read(async db => {
    const cold = await loadDailyFlowLearningSnapshot(db, 'display-fixture');
    const warm = await loadDailyFlowLearningSnapshot(db, 'display-fixture', undefined, library.owner.readNodeMetadata(db)!);
    expect(warm.nodesById).toEqual(cold.nodesById);
    expect([...warm.nodeOrder].sort()).toEqual([...cold.nodeOrder].sort());
    expect(warm.trashedNodeIds).toEqual(cold.trashedNodeIds);
    return warm.nodesById;
  });
}

async function members(library: Library) {
  await library.owner.runWriter(async db => {
    await db.run('DELETE FROM daily_flow_state');
    await db.run('DELETE FROM daily_flow_entries');
    await db.run('DELETE FROM daily_flow_operations');
  });
  const result = await openCompanionDailyFlow({ now, mode: 'reading-only' });
  expect((await openCompanionDailyFlow({ now, mode: 'reading-only' })).session).toEqual(result.session);
  return library.owner.read(async db => (await db.query<{ node_id: string }>(
    'SELECT node_id FROM daily_flow_entries ORDER BY order_key')).map(row => row.node_id));
}

it.each(['android', 'ios'] as const)('%s preserves resolved, unmapped and malformed anchor eligibility after commits and rebuilding', async platform => {
  const library = createDisplayLibrary(platform);
  runtime.owner = library.owner;
  try {
    await library.owner.open({ expectedHostName: 'display-fixture', now });
    const link = JSON.stringify({ id: 'anchor', kind: 'image-excerpt', locator: { from: 0, to: 4, originalText: 'Text' } });
    await library.owner.runWriter(async db => {
      for (const [id, status, raw] of [
        ['resolved', 'resolved', link], ['missing', 'unmapped_missing', link],
        ['wildcard', 'UNMAPPEDX', link], ['invalid', null, 'not-json']
      ] as const) await db.run(`INSERT INTO nodes
        (id,title,content,anchor_link,anchor_resolution_status,created_at,updated_at) VALUES (?,?,'Text',?,?,?,?)`,
      [id, id, raw, status, now, now]);
    });
    const display = await refreshCompanionWorkspaceSnapshot();
    expect(display?.nodesById.missing?.anchorLink?.kind).toBe('image-excerpt');
    const before = await anchors(library);
    expect(before.resolved?.anchorLink).toEqual({ kind: 'image-excerpt' });
    for (const id of ['missing', 'wildcard', 'invalid']) expect(before[id]?.anchorLink).toBeNull();
    expect((await members(library)).sort()).toEqual(['invalid', 'missing', 'wildcard']);
    const scope = { kind: 'nodes' as const, nodeIds: ['resolved', 'missing'] };
    await runCompanionHighValueMutationTask(() => library.owner.runWriter(db => db.transaction(async tx => {
      await tx.run("UPDATE nodes SET anchor_resolution_status='unmapped_missing' WHERE id='resolved'");
      await tx.run("UPDATE nodes SET anchor_resolution_status='resolved' WHERE id='missing'");
    })), scope);
    expect((await anchors(library)).resolved?.anchorLink).toBeNull();
    expect((await members(library)).sort()).toEqual(['invalid', 'resolved', 'wildcard']);
    library.owner.clearNodePriorities();
    await refreshCompanionWorkspaceSnapshot();
    expect((await members(library)).sort()).toEqual(['invalid', 'resolved', 'wildcard']);
  } finally { await library.close(); runtime.owner = null; }
});

it.each(['android', 'ios'] as const)('%s refreshes child eligibility when receiving only its parent text', async platform => {
  const library = createDisplayLibrary(platform);
  runtime.owner = library.owner;
  const release = holdCompanionSyncAppliedRefresh();
  try {
    await library.owner.open({ expectedHostName: 'display-fixture', now });
    const parent: WorkspaceNodeSnapshot = { id: 'parent', parentNodeId: null, kind: 'topic', title: 'Parent',
      content: 'Chosen text', reveal: null, anchorLink: null, reading: null, review: null,
      isTitleManual: true, hideTitleHeading: false, createdAt: now, updatedAt: now };
    const child = { ...parent, id: 'child', parentNodeId: 'parent', content: 'Child body',
      anchorLink: { id: 'anchor', kind: 'image-excerpt' as const, locator: { from: 0, to: 11, originalText: 'Chosen text' } } };
    await applyCompanionLocalNodeVersions(await Promise.all([parent, child]
      .map(node => toWorkspaceNativeNodeVersion(node, 'fixture', `seed-${node.id}`))));
    await refreshCompanionWorkspaceSnapshot();
    expect(await members(library)).toEqual(['parent']);
    const incoming = await toWorkspaceNativeNodeVersion({ ...parent, content: 'Replacement',
      currentVersionId: 'seed-parent' }, 'remote', 'received-parent');
    expect(await applyCompanionSyncNodeVersions([incoming])).toEqual(['parent']);
    expect((await anchors(library)).child?.anchorLink).toBeNull();
    expect((await members(library)).sort()).toEqual(['child', 'parent']);
    expect((await readCompanionContentSource('child')).content).toBe('Child body');
  } finally { release(); await library.close(); runtime.owner = null; }
});
