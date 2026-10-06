// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { deleteNodesPermanently } from '../../lib/core/database/nodePermanentDeleteMutations.js';
import { initializeWorkspaceSearchSidecar } from '../../lib/core/database/workspaceSearchSidecar.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';
import { prepareImportedNodeDeletionVersions } from '../database/importedNodeDeletionVersions.js';

import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

it.each([false, true])('synchronizes production permanent deletion and member position with original received=%s', async (receivedOriginal) => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  let passed = false;
  try {
    const nodeId = 'permanently-deleted';
    const deletedAt = '2026-10-07T00:00:00.000Z';
    await fixture.left.seed({ content: 'Original retained body', nodeId, title: 'Permanent deletion' });
    const input = { input: { kind: 'reconcile', peer: { deviceId: fixture.rightSnapshot.deviceId,
      libraryEpoch: 'desktop-b-epoch' }, peerOrigin: fixture.rightSnapshot.origin } };
    if (receivedOriginal) await fixture.left.invoke('round', input);
    const source = new Database(fixture.leftSnapshot.databasePath);
    try {
      const driver = createBetterSqlite3Driver(source);
      source.exec("ATTACH DATABASE ':memory:' AS search");
      initializeWorkspaceSearchSidecar({ sqlite: source, driver });
      // The desktop caller flushes the deleted snapshot before writing its permanent tombstone.
      prepareImportedNodeDeletionVersions(driver, [nodeId], deletedAt);
      deleteNodesPermanently(driver, { nodeIds: [nodeId], nodeOrder: [], deletedAt });
    } finally { source.close(); }
    await fixture.left.invoke('round', input);
    await expect(fixture.left.invoke('round', input)).resolves.toMatchObject({ complete: true });
    const left = new Database(fixture.leftSnapshot.databasePath, { readonly: true });
    const right = new Database(fixture.rightSnapshot.databasePath, { readonly: true });
    try {
      const position = 'SELECT fact_id, adopted_version_id, pending_version_ids_json, proof_revision FROM node_version_member_positions WHERE device_identity_key = ?';
      expect(right.prepare(position).all(fixture.leftSnapshot.deviceId))
        .toEqual(left.prepare(position).all(fixture.leftSnapshot.deviceId));
      const tombstone = 'SELECT node_id, version_id, content_hash, deleted_at FROM node_sync_tombstones WHERE node_id = ?';
      expect(right.prepare(tombstone).get(nodeId)).toEqual(left.prepare(tombstone).get(nodeId));
      const body = `SELECT body_text FROM node_sync_versions WHERE version_id =
        (SELECT version_id FROM node_sync_tombstones WHERE node_id = ?)`;
      expect(right.prepare(body).pluck().get(nodeId)).toBe('Original retained body');
      const parents = `SELECT edge.* FROM node_sync_version_parents edge
        JOIN node_sync_versions version ON version.version_id = edge.version_id
        WHERE version.object_id = ? ORDER BY edge.version_id, edge.ordinal`;
      expect(right.prepare(parents).all(nodeId)).toEqual(left.prepare(parents).all(nodeId));
      expect(right.prepare('SELECT id FROM nodes WHERE id = ?').all(nodeId)).toEqual([]);
      expect(left.prepare('SELECT * FROM framed_sync_outbound_holds').all()).toEqual([]);
    } finally { left.close(); right.close(); }
    await fixture.restartLeft();
    const restarted = await fixture.restartRight();
    await expect(fixture.left.invoke('round', { input: { kind: 'reconcile',
      peer: { deviceId: restarted.snapshot.deviceId, libraryEpoch: 'desktop-b-epoch' },
      peerOrigin: restarted.snapshot.origin } })).resolves.toMatchObject({ complete: true, transferred: 0 });
    passed = true;
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    if (passed) await fs.rm(fixture.root, { force: true, recursive: true });
    else console.info('Permanent deletion fixture retained:', fixture.root);
  }
}, 60_000);
