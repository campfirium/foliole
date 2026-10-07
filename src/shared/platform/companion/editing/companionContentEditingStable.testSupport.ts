import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';

import { migrateBodyContentStorage } from '../../../../../lib/core/database/bodyContentMigration.js';
import { migrateBodyContentOwners } from '../../../../../lib/core/database/bodyContentOwnerMigration.js';
import { migrateCompanionFramedSyncInventory } from '../../../../../lib/core/database/framedSyncInventoryMigration.js';
import { migrateVerifiedBodyInventory } from '../../../../../lib/core/database/verifiedBodyInventoryMigration.js';
import { toWorkspaceNativeNodeVersion } from '../../../../../lib/core/database/workspaceNodeSyncVersion.js';
import type { WorkspaceNodeSnapshot } from '../../../../../lib/core/database/workspaceSnapshotHelpers.js';
import { applySyncNodesWithDbPort } from '../../../../../lib/core/sync/syncNodeApplyExecutor.js';
import { COMPANION_DATABASE_VERSION } from '../../../../../lib/platform/nativeCompanionContract.js';
import { createFakeCapacitorConnection, installCompanionNodeSchema } from '../../companionSyncNodeVersionsTestSupport.js';
import { CapacitorCompanionDatabaseOwner } from '../runtime/capacitorCompanionDatabaseOwner.js';

export const editTime = '2026-10-07T00:00:00.000Z';
export const editBaseline = 'Apples\nBread\nMilk\n';

export function editableNode(overrides: Partial<WorkspaceNodeSnapshot> = {}): WorkspaceNodeSnapshot {
  return { id: 'topic', content: editBaseline, kind: 'topic', title: 'Shopping', isTitleManual: true,
    hideTitleHeading: false, parentNodeId: null, reveal: null, anchorLink: null, reading: null,
    review: null, createdAt: editTime, updatedAt: editTime, ...overrides };
}

export async function stableEditingHost(platform: 'android' | 'ios') {
  const directory = mkdtempSync(join(tmpdir(), 'companion-stable-edit-'));
  const path = join(directory, 'companion.sqlite');
  let sqlite = new Database(path);
  installCompanionNodeSchema(sqlite);
  sqlite.pragma(`user_version = ${COMPANION_DATABASE_VERSION}`);
  sqlite.prepare('INSERT INTO companion_meta VALUES (?, ?, ?)').run('device_id', 'mobile', editTime);
  const connection = () => ({ ...createFakeCapacitorConnection(sqlite), getUrl: async () => ({ url: path }) });
  const manager = { closeConnection: async () => undefined, createConnection: async () => connection(),
    retrieveConnection: async () => connection(), isConnection: async () => ({ result: true }),
    isDatabase: async () => ({ result: true }) };
  const owner = new CapacitorCompanionDatabaseOwner(manager as never, platform);
  await owner.open({ expectedHostName: 'mobile', now: editTime });
  await owner.runWriter(migrateCompanionFramedSyncInventory);
  return {
    owner, get sqlite() { return sqlite; },
    async seed(node: WorkspaceNodeSnapshot, version: string) {
      const record = await toWorkspaceNativeNodeVersion(node, 'remote', version);
      await owner.runWriter((db) => applySyncNodesWithDbPort(db, [record], { enqueueSearchInvalidations: false }));
    },
    async migrate() {
      await owner.runWriter((db) => db.transaction(async (tx) => {
        await migrateBodyContentStorage(tx);
        await migrateBodyContentOwners(tx, 'companion');
        await migrateVerifiedBodyInventory(tx);
        await tx.run('DROP TABLE content_blob_data');
      }));
    },
    async reopen() {
      await owner.close();
      sqlite.close();
      sqlite = new Database(path);
      await owner.open({ expectedHostName: 'mobile', now: editTime });
    },
    async close() { await owner.close(); sqlite.close(); rmSync(directory, { recursive: true, force: true }); }
  };
}

export function editingDatabaseState(sqlite: Database.Database) {
  return Object.fromEntries(['nodes', 'node_sync_versions', 'node_sync_version_parents',
    'node_version_local_holds', 'content_bodies', 'content_body_chunks', 'content_blobs',
    'node_version_local_proof_state', 'sync_object_state'].map((table) =>
    [table, sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
}
