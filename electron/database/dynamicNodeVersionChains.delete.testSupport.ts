import Database from 'better-sqlite3';
import { expect } from 'vitest';

import { deleteNodesPermanently } from '../../lib/core/database/nodePermanentDeleteMutations.js';
import { initializeWorkspaceSearchSidecar } from '../../lib/core/database/workspaceSearchSidecar.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import type { Peer } from './syncEmptyLibraryTestSupport.js';

export function permanentlyDelete(peer: Peer) {
  const at = '2026-10-01T00:00:00.000Z';
  if (!(peer.db.pragma('database_list') as Array<{ name: string }>).some(row => row.name === 'search')) {
    peer.db.exec("ATTACH DATABASE ':memory:' AS search");
  }
  initializeWorkspaceSearchSidecar({ sqlite: peer.db, driver: peer.driver });
  peer.driver.execute(`UPDATE nodes SET deleted_at = ?, updated_at = ?, sync_dirty = 1 WHERE id = 'topic'`, [at, at]);
  const deletionId = flushNodeSyncVersionWithDriver(peer.driver, 'topic', peer.name, at)!;
  expect(deletionId).toBeTruthy();
  deleteNodesPermanently(peer.driver, { nodeIds: ['topic'], nodeOrder: [], deletedAt: at });
  return peer.db.prepare('SELECT * FROM node_sync_tombstones WHERE node_id = ?').get('topic') as {
    version_id: string; parent_version_id: string | null; snapshot_json: string;
  };
}

export function restartDeletedPeer(peer: Peer) {
  peer.db.close();
  peer.db = new Database(peer.file);
  peer.db.pragma('foreign_keys = ON');
  peer.driver = createBetterSqlite3Driver(peer.db);
  peer.port = createBetterSqliteDbPort(peer.db);
}
