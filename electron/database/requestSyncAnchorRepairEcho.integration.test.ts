// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';
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

async function repairOnBoth() {
  const source = createPeer('source');
  const target = createPeer('target');
  joinPeers(source, target);
  const first = node('parent', textBranch('parent-v1', 'Alpha Beta Gamma', undefined, '2026-09-30T00:00:00.000Z'));
  const highlight = node('child', textBranch('child-v1', 'Note', undefined, '2026-09-30T00:00:00.000Z'), {
    parent_id: 'parent',
    anchor_link: JSON.stringify({ id: 'anchor-1', kind: 'highlight', locator: { from: 6, originalText: 'Beta', to: 10 } })
  });
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
});

it('still keeps an unpublished local edit made beside the repair', async () => {
  const { source, target } = await repairOnBoth();
  target.db.prepare("UPDATE nodes SET title = 'Local title', updated_at = '2026-09-30T03:00:00.000Z' WHERE id = 'child'").run();

  await expect(withLibraryRequestSnapshot(source, target, replay => replay())).rejects.toThrow('sync_node_apply_blocked:child');

  expect(target.db.prepare("SELECT title, sync_dirty FROM nodes WHERE id = 'child'").get())
    .toEqual({ title: 'Local title', sync_dirty: 1 });
});
