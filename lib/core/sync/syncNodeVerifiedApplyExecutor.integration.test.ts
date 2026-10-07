// @vitest-environment node
import { expect, it } from 'vitest';

import { nodeMetadata, observeReads, referencedNode } from '../../../electron/database/syncNodeVerifiedTopicConflict.testSupport.js';
import { textBranch, textDevice } from '../../../electron/database/topicTextState.testSupport.js';
import { migrateBodyContentStorage } from '../database/bodyContentMigration.js';
import { buildCanonicalNodeSyncPayload } from '../database/nodeSyncPayload.js';
import { nodeSyncSnapshotHashMetadata } from '../database/nodeSyncSnapshotMetadata.js';

import type { VerifiedFramedSyncNode } from './framedSyncVerifiedNode.js';
import { applySyncNodesWithDbPort, type ApplySyncNodesWithDbPortOptions } from './syncNodeApplyExecutor.js';
import { hashText } from './syncNodeResolution.js';
import { applyVerifiedSyncNodesWithDbPort } from './syncNodeVerifiedApplyExecutor.js';
import { loadCurrentVerifiedSyncNode } from './syncNodeVerifiedGraph.js';
import { readBodyText } from './verifiedBody.js';

const timestamp = '2026-10-07T00:00:00.000Z';
const summarize = (result: Awaited<ReturnType<typeof applySyncNodesWithDbPort>> | Awaited<ReturnType<typeof applyVerifiedSyncNodesWithDbPort>>) => ({
  appliedIds: result.appliedIds, blockedIds: result.blockedIds, tombstoneBlockedIds: result.tombstoneBlockedIds,
  skippedConflictCopyIds: result.skippedConflictCopyIds,
  conflicts: result.conflictRecords.map((record) => ({ version: record.conflict_version_id, object: record.object_id, hash: record.content_hash })),
  repaired: result.anchorRepairRecords, unmapped: result.unmappedAnchorRecords
});

it('proves the old application reads body text where the stable path only reads metadata', async () => {
  const old = textDevice();
  const stable = textDevice();
  try {
    const original = textBranch('version', 'x'.repeat(3 * 1024 * 1024), undefined, timestamp);
    await expect(applySyncNodesWithDbPort(observeReads(old.db).port, [original])).rejects.toThrow('unexpected_full_body_read');
    await migrateBodyContentStorage(stable.db);
    const record = await referencedNode(stable.db, original);
    const observed = observeReads(stable.db);
    expect((await applyVerifiedSyncNodesWithDbPort(observed.port, [record])).appliedIds).toEqual(['topic']);
    expect(observed.sizes).toEqual([]);
  } finally { old.sqlite.close(); stable.sqlite.close(); }
});

it.each([false, true])('preserves tombstone identity when transport replaces the original body: %s', async (emptyTransport) => {
  const old = textDevice();
  const stable = textDevice();
  try {
    const original = textBranch('deleted', 'Original deleted body', undefined, timestamp);
    original.is_tombstone = true;
    original.snapshot.deleted_at = timestamp;
    original.content_hash = hashText(JSON.stringify(buildCanonicalNodeSyncPayload({
      ...nodeSyncSnapshotHashMetadata(original.snapshot), content: original.body_text!
    })));
    const transfer = emptyTransport ? { ...original, body_text: '', snapshot: { ...original.snapshot, content: '' } } : original;
    const expected = await applySyncNodesWithDbPort(old.db, [transfer]);
    await migrateBodyContentStorage(stable.db);
    const incoming = await referencedNode(stable.db, transfer);
    const actual = await applyVerifiedSyncNodesWithDbPort(stable.db, [incoming]);
    expect(summarize(actual)).toEqual(summarize(expected));
    expect(stable.sqlite.prepare('SELECT count(*) FROM nodes').pluck().get()).toBe(0);
    expect(stable.sqlite.prepare('SELECT version_id, content_hash FROM node_sync_tombstones').all())
      .toEqual(old.sqlite.prepare('SELECT version_id, content_hash FROM node_sync_tombstones').all());
    expect(stable.sqlite.prepare('SELECT version_id, content_hash FROM node_sync_versions').all())
      .toEqual(old.sqlite.prepare('SELECT version_id, content_hash FROM node_sync_versions').all());
    expect(stable.sqlite.prepare('SELECT count(*) FROM node_sync_versions').pluck().get()).toBe(emptyTransport ? 0 : 1);
  } finally { old.sqlite.close(); stable.sqlite.close(); }
});

it.each(['forward', 'stale', 'conflict', 'dirty', 'local_mutation', 'local_restore', 'identical'] as const)(
  'keeps %s application decisions and persistent state without loading full bodies', async (scenario) => {
    const old = textDevice();
    const stable = textDevice();
    try {
      const base = textBranch('base', 'Base', undefined, timestamp);
      const local = textBranch('local', 'Current', base, '2026-10-07T01:00:00.000Z');
      for (const host of [old, stable]) {
        await applySyncNodesWithDbPort(host.db, [local, base]);
        if (scenario === 'dirty' || scenario === 'local_mutation') host.sqlite.prepare('UPDATE nodes SET sync_dirty = 1').run();
        if (scenario === 'local_restore') host.sqlite.prepare('UPDATE nodes SET deleted_at = ?').run(timestamp);
      }
      await migrateBodyContentStorage(stable.db);
      const parent = scenario === 'conflict' ? base : local;
      const incoming = scenario === 'stale' ? base : scenario === 'identical' ? local :
        textBranch('incoming', '中文🙂'.repeat(300000), parent, '2026-10-07T02:00:00.000Z');
      const options: ApplySyncNodesWithDbPortOptions = {
        ...(scenario === 'local_mutation' || scenario === 'local_restore' ? { operation: scenario } : {}),
        includeAlreadyApplied: true
      };
      const expected = await applySyncNodesWithDbPort(old.db, [incoming], options);
      const record = await referencedNode(stable.db, incoming);
      const reads = observeReads(stable.db);
      const actual = await applyVerifiedSyncNodesWithDbPort(reads.port, [record], options);
      expect(summarize(actual)).toEqual(summarize(expected));
      expect(stable.sqlite.prepare('SELECT * FROM nodes').all()).toEqual(old.sqlite.prepare('SELECT * FROM nodes').all());
      for (const table of ['sync_object_state', 'node_sync_version_parents', 'node_version_local_origins']) {
        expect(stable.sqlite.prepare(`SELECT * FROM ${table}`).all()).toEqual(old.sqlite.prepare(`SELECT * FROM ${table}`).all());
      }
      expect(reads.sizes).toEqual([]);
      const current = await loadCurrentVerifiedSyncNode(stable.db, 'topic');
      if (current?.body.kind !== 'readable') throw new Error('readable_current_required');
      const selected = (old.sqlite.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').get(
        current.metadata.version_id) as { body_text: string }).body_text;
      expect(await readBodyText(stable.db, current.body.ref)).toBe(selected);
      expect(stable.sqlite.prepare('SELECT count(*) FROM content_blob_data').pluck().get()).toBe(0);
    } finally { old.sqlite.close(); stable.sqlite.close(); }
  }
);

it('retains retired history without making it current and preserves parent edges', async () => {
  const host = textDevice();
  try {
    await migrateBodyContentStorage(host.db);
    const base = textBranch('base', 'Base', undefined, timestamp);
    const descendant = textBranch('next', 'Descendant', base, timestamp);
    const identity: VerifiedFramedSyncNode = { metadata: nodeMetadata(base), body: { kind: 'retired' }, alternativeBodies: [] };
    const selected = await referencedNode(host.db, descendant);
    expect((await applyVerifiedSyncNodesWithDbPort(host.db, [selected, identity])).appliedIds).toEqual(['topic']);
    expect(host.sqlite.prepare('SELECT version_id, body_state FROM node_sync_versions ORDER BY version_id').all())
      .toEqual([{ version_id: 'base', body_state: 'retired' }, { version_id: 'next', body_state: 'readable' }]);
    expect(host.sqlite.prepare('SELECT * FROM node_sync_version_parents').all())
      .toEqual([{ version_id: 'next', parent_version_id: 'base', ordinal: 0 }]);
  } finally { host.sqlite.close(); }
});

it('rolls back all current nodes, version owners and search invalidations when the last unit fails', async () => {
  const host = textDevice();
  try {
    await migrateBodyContentStorage(host.db);
    const first = await referencedNode(host.db, textBranch('first', 'First', undefined, timestamp));
    const original = textBranch('second', 'Second', undefined, timestamp);
    original.object_id = 'other'; original.snapshot.id = 'other';
    const second = await referencedNode(host.db, original);
    host.sqlite.exec(`CREATE TRIGGER reject_last BEFORE INSERT ON nodes WHEN NEW.id = 'other'
      BEGIN SELECT RAISE(ABORT, 'last_unit_failure'); END`);
    await expect(applyVerifiedSyncNodesWithDbPort(host.db, [first, second])).rejects.toThrow('last_unit_failure');
    for (const table of ['nodes', 'node_sync_versions', 'content_blobs', 'sync_object_state', 'search_index_invalidations']) {
      expect(host.sqlite.prepare(`SELECT count(*) FROM ${table}`).pluck().get()).toBe(0);
    }
    expect(host.sqlite.prepare('SELECT count(*) FROM content_bodies WHERE verified = 1').pluck().get()).toBe(2);
    host.sqlite.exec('DROP TRIGGER reject_last');
    expect((await applyVerifiedSyncNodesWithDbPort(host.db, [first, second])).appliedIds).toEqual(['topic', 'other']);
  } finally { host.sqlite.close(); }
});
