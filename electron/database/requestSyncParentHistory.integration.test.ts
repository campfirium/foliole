// @vitest-environment node
import { expect, it } from 'vitest';

import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

import { restoreFixture, transfer, type RestorePeer } from './requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from './topicTextState.testSupport.js';

const at = '2026-10-13T00:00:00.000Z';
function version(id: string, nodeId: string, body: string, parent?: NativeSyncNodeRecord): NativeSyncNodeRecord {
  const record = textBranch(id, body, parent, at);
  return { ...record, host_name: 'desktop', object_id: nodeId,
    snapshot: { ...record.snapshot, id: nodeId, title: nodeId === 'parent' ? 'Parent' : 'Node 1',
      parent_id: nodeId === 'parent' ? null : 'parent' } };
}
function histories() {
  const parent: NativeSyncNodeRecord[] = [];
  const child = [version('desktop#node-1-v1', 'node-1', 'node body must stay out of pack')];
  for (let index = 1; index <= 129; index++) {
    const suffix = String(index).padStart(4, '0');
    parent.push(version(`p${suffix}`, 'parent', 'body', parent.at(-1)));
    child.push(version(`v${suffix}`, 'node-1', 'body', child.at(-1)));
  }
  return { parent, child };
}
function originalRows(peer: RestorePeer, nodeId: string) {
  return peer.sqlite.prepare<[string], Record<string, unknown> & { version_id: string; snapshot_json: string }>(
    'SELECT * FROM node_sync_versions WHERE object_id = ? ORDER BY version_id').all(nodeId);
}
function retiredRows(rows: ReturnType<typeof originalRows>, head: string | null) {
  return rows.map(row => row.version_id === head ? row : { ...row, body_text: null,
    snapshot_json: JSON.stringify({ ...JSON.parse(row.snapshot_json), content: null, body_deleted: true }) });
}
function graph(peer: RestorePeer, nodeId: string) {
  return {
    versions: peer.sqlite.prepare<[string], { version_id: string; body_text: string | null }>(`SELECT version_id, object_id, parent_version_id, host_name,
      created_at, content_hash, body_text FROM node_sync_versions WHERE object_id = ? ORDER BY version_id`).all(nodeId),
    parents: peer.sqlite.prepare(`SELECT edge.version_id, edge.parent_version_id, edge.ordinal
      FROM node_sync_version_parents edge JOIN node_sync_versions version ON version.version_id = edge.version_id
      WHERE version.object_id = ? ORDER BY edge.version_id, edge.ordinal`).all(nodeId)
  };
}
function childState(peer: RestorePeer) {
  return { node: peer.sqlite.prepare("SELECT * FROM nodes WHERE id = 'node-1'").get(),
    versions: originalRows(peer, 'node-1'), graph: graph(peer, 'node-1'),
    state: peer.sqlite.prepare("SELECT * FROM sync_object_state WHERE object_type = 'node' AND object_id = 'node-1'").get() };
}
async function differences(source: RestorePeer, target: RestorePeer) {
  return compareFramedSyncInventories({ local: await readFramedSyncInventory(source.db),
    remote: await readFramedSyncInventory(target.db) }).filter(value => value.direction === 'local_to_remote');
}

it('fills the last two parent versions without changing the already known child history across replay and reopen', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const records = histories();
    await applyConvergentSyncNodesWithDbPort(source.db, records.parent);
    await applyConvergentSyncNodesWithDbPort(target.db, records.parent.slice(0, 127));
    await applySyncNodesWithDbPort(source.db, records.child);
    await applySyncNodesWithDbPort(target.db, records.child);
    const beforeChild = childState(target);
    const knownParent = originalRows(target, 'parent');
    const sourceParent = originalRows(source, 'parent');
    const sourceChild = childState(source);
    const expected = graph(source, 'parent');
    expect(expected.versions).toHaveLength(129);
    expect(expected.parents).toHaveLength(128);
    expect(knownParent).toHaveLength(127);
    expect(beforeChild.versions).toHaveLength(130);
    expected.versions = expected.versions.map(row => row.version_id === 'p0129' ? row : { ...row, body_text: null });
    const changes = await differences(source, target);
    expect(changes.map(value => ({ objectType: value.objectType, globalId: value.globalId })))
      .toEqual([{ objectType: 'node', globalId: 'parent' }]);
    const difference = changes[0]!;
    // Two new identities plus the sender's retirement declaration for the previously current parent.
    expect([...difference.need.frontierFactIds].sort()).toEqual(['p0127', 'p0128', 'p0129']);
    const progress = { groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
      providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch };
    // The retirement declaration updates a known identity; receiver growth remains exactly two versions.
    for (let replay = 0; replay < 2; replay++) {
      await transfer(source, target, progress, difference, false); target.reopen();
      expect(graph(target, 'parent')).toEqual(expected);
      expect(originalRows(target, 'parent').slice(0, 127)).toEqual(retiredRows(knownParent, null));
      expect(originalRows(target, 'parent')).toHaveLength(knownParent.length + 2);
      expect(target.sqlite.prepare("SELECT current_version_id, content FROM nodes WHERE id = 'parent'").get())
        .toEqual({ current_version_id: 'p0129', content: 'body' });
      expect(childState(target)).toEqual(beforeChild);
      expect(originalRows(source, 'parent')).toEqual(sourceParent);
      expect(childState(source)).toEqual(sourceChild);
      expect(await differences(source, target)).toEqual([]);
    }
  } finally { await fixture.close(); }
});
