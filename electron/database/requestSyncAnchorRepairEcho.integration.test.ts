// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import type { UpsertNodeSnapshotInput } from '../../lib/core/database/nodeMutationPayloads.js';
import { upsertNodeSnapshot, updateNodeAnchorLinks } from '../../lib/core/database/nodeMutations.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';
import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';
import { isIncomingLocalAnchorRepair } from '../../lib/core/sync/syncNodeLocalAnchorRepair.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import { closeLibraries, createPeer, joinPeers, startLibraries, type Peer } from './syncLibrary.testSupport.js';
import { withLibraryRequestSnapshot } from './syncRequestSnapshot.testSupport.js';
import { textBranch } from './topicTextState.testSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

function node(id: string, record: NativeSyncNodeRecord, extra: Partial<NativeSyncNodeRecord['snapshot']> = {}) {
  return { ...record, object_id: id, snapshot: { ...record.snapshot, id, ...extra } };
}

function child(peer: Peer) {
  return peer.db.prepare(`SELECT current_version_id, sync_dirty, anchor_source_version_id, anchor_link
    FROM nodes WHERE id = 'child'`).get();
}

async function repairOnBoth(emptyList = true) {
  const source = createPeer('source');
  const target = createPeer('target');
  joinPeers(source, target);
  const first = node('parent', textBranch('parent-v1', 'Alpha Beta Gamma', undefined, '2026-09-30T00:00:00.000Z'));
  const highlight = node('child', textBranch('child-v1', 'Note', undefined, '2026-09-30T00:00:00.000Z'), {
    parent_id: 'parent',
    anchor_link: JSON.stringify({ id: 'anchor-1', kind: 'highlight', locator: { from: 6, originalText: 'Beta', to: 10 } })
  });
  if (!emptyList) delete highlight.snapshot.text_alternatives;
  // Both devices hold the same highlight, receive the parent's new text and move the highlight on their own.
  const second = node('parent', textBranch('parent-v2', 'Prefix Alpha Beta Gamma', first, '2026-09-30T01:00:00.000Z'));
  for (const peer of [source, target]) {
    await applyConvergentSyncNodesWithDbPort(peer.port, [first, highlight]);
    await applyConvergentSyncNodesWithDbPort(peer.port, [second]);
  }
  expect(child(target)).toMatchObject({ current_version_id: 'child-v1', sync_dirty: 1 });
  const repaired = flushNodeSyncVersionWithDriver(source.driver, 'child', 'source', '2026-09-30T02:00:00.000Z')!;
  return { source, target, repaired };
}

it('accepts the anchor repair another device published for the repair this device still holds', async () => {
  const { source, target, repaired } = await repairOnBoth();

  await withLibraryRequestSnapshot(source, target, replay => replay());

  expect(child(target)).toEqual({ ...child(source) as object, current_version_id: repaired, sync_dirty: 0 });
  expect(persisted(target)).toEqual(persisted(source));
});

it('still keeps an unpublished local edit made beside the repair', async () => {
  const { source, target } = await repairOnBoth();
  target.db.prepare("UPDATE nodes SET title = 'Local title', updated_at = '2026-09-30T03:00:00.000Z' WHERE id = 'child'").run();

  await expect(withLibraryRequestSnapshot(source, target, replay => replay())).rejects.toThrow('sync_node_apply_blocked:child');

  expect(target.db.prepare("SELECT title, sync_dirty FROM nodes WHERE id = 'child'").get())
    .toEqual({ title: 'Local title', sync_dirty: 1 });
});

function persisted(peer: Peer) {
  const reopened = new Database(peer.file, { readonly: true });
  try {
    return {
      node: reopened.prepare("SELECT * FROM nodes WHERE id = 'child'").get(),
      parents: reopened.prepare(`SELECT version_id, parent_version_id FROM node_sync_version_parents
        WHERE version_id = (SELECT current_version_id FROM nodes WHERE id = 'child') ORDER BY ordinal`).all()
    };
  } finally { reopened.close(); }
}

it('accepts a repair based on a current head without a coupled alternative list', async () => {
  const { source, target, repaired } = await repairOnBoth(false);
  await withLibraryRequestSnapshot(source, target, replay => replay());
  expect(persisted(target)).toEqual(persisted(source));
  expect(child(target)).toMatchObject({ current_version_id: repaired, sync_dirty: 0,
    anchor_source_version_id: 'parent-v2' });
});

function writeBesideRepair(target: Peer, change: Partial<UpsertNodeSnapshotInput>) {
  const anchor = JSON.parse((child(target) as { anchor_link: string }).anchor_link);
  upsertNodeSnapshot(target.driver, {
    nodeId: 'child', parentNodeId: 'parent', kind: 'topic', title: 'Topic', isTitleManual: false,
    content: 'Note', anchorLink: anchor, position: null, reveal: null,
    createdAt: '2026-09-30T00:00:00.000Z', updatedAt: '2026-09-30T01:00:00.000Z', ...change
  });
}

it.each([
  ['body', { content: 'Unpublished body' }],
  ['title', { title: 'Unpublished title' }],
  ['reveal', { reveal: 'Unpublished answer' }],
  ['parent', { parentNodeId: null }]
] satisfies Array<[string, Partial<UpsertNodeSnapshotInput>]>)('keeps an unpublished %s write at the repair timestamp', async (_field, change) => {
  const { source, target } = await repairOnBoth(false);
  writeBesideRepair(target, change);
  const before = persisted(target);
  await expect(withLibraryRequestSnapshot(source, target, replay => replay())).rejects.toThrow('sync_node_apply_blocked:child');
  expect(persisted(target)).toEqual(before);
  expect(child(target)).toMatchObject({ current_version_id: 'child-v1', sync_dirty: 1,
    anchor_source_version_id: 'parent-v2' });
});

it('keeps a different local anchor at the repair timestamp', async () => {
  const { source, target } = await repairOnBoth(false);
  updateNodeAnchorLinks(target.driver, [{ nodeId: 'child', updatedAt: '2026-09-30T01:00:00.000Z',
    anchorLink: { id: 'anchor-1', kind: 'highlight', locator: { from: 0, to: 6, originalText: 'Prefix' } } }]);
  const before = persisted(target);
  await expect(withLibraryRequestSnapshot(source, target, replay => replay())).rejects.toThrow('sync_node_apply_blocked:child');
  expect(persisted(target)).toEqual(before);
});

it('rejects a different parent version, anchor source or nonempty alternative fact', async () => {
  const { source, target } = await repairOnBoth();
  const incoming = (await loadCurrentSyncNodeRecord(source.port, 'child'))!;
  expect(await isIncomingLocalAnchorRepair(target.port, incoming)).toBe(true);
  const before = persisted(target);
  const nonempty = [{ id: 'alternative', body_blob_hash: 'a'.repeat(64), source_host_name: 'other',
    created_at: '2026-09-30T00:00:00.000Z', expires_at: '2026-10-30T00:00:00.000Z' }];
  for (const record of [
    { ...incoming, parent_version_id: 'another-parent-version' },
    { ...incoming, snapshot: { ...incoming.snapshot, anchor_source_version_id: 'parent-v1' } },
    { ...incoming, snapshot: { ...incoming.snapshot, text_alternatives: nonempty } }
  ]) expect(await isIncomingLocalAnchorRepair(target.port, record)).toBe(false);
  expect(persisted(target)).toEqual(before);
});
