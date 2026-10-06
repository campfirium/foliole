// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { deleteNodesPermanently } from '../../lib/core/database/nodePermanentDeleteMutations.js';
import { initializeWorkspaceSearchSidecar } from '../../lib/core/database/workspaceSearchSidecar.js';
import { loadRetainedSyncNodeVersionRecords } from '../../lib/core/sync/syncNodeGraph.js';
import { applyRemoteNodeTombstone } from '../../lib/core/sync/syncNodeTombstoneApply.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { closeLibraries, createPeer, edit, startLibraries } from '../database/syncEmptyLibraryTestSupport.js';

import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

it('converges a proven legacy permanent deletion through a normal two-process HTTP round and restart', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  try {
    const nodeId = 'legacy-deleted-node';
    const deletedAt = '2026-07-24T02:12:44.137Z';
    await fixture.left.seed({ content: 'Protected original body', nodeId, title: 'Legacy deletion' });
    const input = { input: { kind: 'reconcile', peer: { deviceId: fixture.rightSnapshot.deviceId,
      libraryEpoch: 'desktop-b-epoch' }, peerOrigin: fixture.rightSnapshot.origin } };
    await fixture.left.invoke('round', input);
    await expect(fixture.left.invoke('round', input)).resolves.toMatchObject({ complete: true });
    const source = new Database(fixture.leftSnapshot.databasePath);
    try {
      const driver = createBetterSqlite3Driver(source);
      source.exec("ATTACH DATABASE ':memory:' AS search");
      initializeWorkspaceSearchSidecar({ sqlite: source, driver });
      deleteNodesPermanently(driver, { nodeIds: [nodeId], nodeOrder: [], deletedAt });
      // Reproduce the proven historical state only in this independent fixture.
      source.prepare("UPDATE sync_object_state SET current_version_id = NULL WHERE object_type = 'node' AND object_id = ?")
        .run(nodeId);
    } finally { source.close(); }
    await fixture.left.invoke('round', input);
    await expect(fixture.left.invoke('round', input)).resolves.toMatchObject({ complete: true });
    const left = new Database(fixture.leftSnapshot.databasePath, { readonly: true });
    const right = new Database(fixture.rightSnapshot.databasePath, { readonly: true });
    try {
      const tombstone = `SELECT node_id, version_id, content_hash, deleted_at
        FROM node_sync_tombstones WHERE node_id = ?`;
      expect(right.prepare(tombstone).get(nodeId)).toEqual(left.prepare(tombstone).get(nodeId));
      expect(right.prepare("SELECT deleted_at FROM sync_object_state WHERE object_type = 'node' AND object_id = ?")
        .get(nodeId)).toEqual({ deleted_at: deletedAt });
      expect(right.prepare('SELECT id FROM nodes WHERE id = ?').get(nodeId)).toBeUndefined();
      expect(left.prepare('SELECT body_text FROM node_sync_versions WHERE object_id = ?').pluck().all(nodeId))
        .toContain('Protected original body');
      expect(left.prepare('SELECT * FROM framed_sync_outbound_holds').all()).toEqual([]);
      expect(right.prepare('SELECT COUNT(*) FROM framed_sync_receipts').pluck().get()).toBeGreaterThan(0);
    } finally { left.close(); right.close(); }
    await fixture.restartLeft();
    const restarted = await fixture.restartRight();
    await expect(fixture.left.invoke('round', { input: { kind: 'reconcile',
      peer: { deviceId: restarted.snapshot.deviceId, libraryEpoch: 'desktop-b-epoch' },
      peerOrigin: restarted.snapshot.origin } })).resolves.toMatchObject({ complete: true, transferred: 0 });
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { force: true, recursive: true });
  }
}, 60_000);

it.each([false, true])('synchronizes a standalone historical tombstone with missing parent=%s without inventing member positions', async (missingParent) => {
  await startLibraries();
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  try {
    const donor = createPeer('historical-fact-donor');
    if (missingParent) edit(donor, 'Historical parent body');
    const versionId = edit(donor, 'Historical original body');
    donor.db.exec("ATTACH DATABASE ':memory:' AS search");
    initializeWorkspaceSearchSidecar({ sqlite: donor.db, driver: donor.driver });
    deleteNodesPermanently(donor.driver, { nodeIds: ['topic'], nodeOrder: [],
      deletedAt: '2026-07-24T02:12:44.137Z' });
    const record = (await loadRetainedSyncNodeVersionRecords(donor.port, [versionId])).get(versionId)!;
    expect(Boolean(record.parent_version_id)).toBe(missingParent);
    const source = new Database(fixture.leftSnapshot.databasePath);
    try {
      await applyRemoteNodeTombstone(createBetterSqliteDbPort(source), record, false);
      source.prepare("UPDATE sync_object_state SET current_version_id = NULL WHERE object_type = 'node' AND object_id = 'topic'").run();
      expect(source.prepare("SELECT * FROM node_version_member_positions WHERE object_id = 'topic'").all()).toEqual([]);
    } finally { source.close(); }
    const input = { input: { kind: 'reconcile', peer: { deviceId: fixture.rightSnapshot.deviceId,
      libraryEpoch: 'desktop-b-epoch' }, peerOrigin: fixture.rightSnapshot.origin } };
    await fixture.left.invoke('round', input);
    await expect(fixture.left.invoke('round', input)).resolves.toMatchObject({ complete: true });
    const right = new Database(fixture.rightSnapshot.databasePath, { readonly: true });
    try {
      expect(right.prepare("SELECT version_id, content_hash, deleted_at FROM node_sync_tombstones WHERE node_id = 'topic'")
        .get()).toEqual({ version_id: versionId, content_hash: record.content_hash,
        deleted_at: record.snapshot.deleted_at });
      expect(right.prepare("SELECT id FROM nodes WHERE id = 'topic'").all()).toEqual([]);
      expect(right.prepare('SELECT COUNT(*) FROM framed_sync_receipts').pluck().get()).toBeGreaterThan(0);
    } finally { right.close(); }
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await closeLibraries();
    await fs.rm(fixture.root, { force: true, recursive: true });
  }
}, 60_000);
