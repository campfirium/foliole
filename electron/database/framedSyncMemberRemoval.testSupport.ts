import Database from 'better-sqlite3';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { nodePositionWriteStatements } from '../../lib/core/sync/nodeVersionMemberPositionFact.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';
import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { createDesktopSyncGroup, registerSyncGroupDevice } from './syncGroupStore.js';
import { textBranch } from './topicTextState.testSupport.js';

export const identities = [1, 2, 3].map((index) => createSyncGroupDeviceIdentity({
  device_anchor: `${index.toString().repeat(8)}-1111-4111-8111-111111111111`,
  group_id: 'group-removal', library_path: `/library/${index}`, path_flavor: 'posix'
}));

export function openMemberDatabase(file: string, index: number, bind: (db: Database.Database) => void) {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  initializeDatabaseSchema(db);
  bind(db);
  createDesktopSyncGroup({ device: identities[index]!, deviceName: String(index),
    platform: 'desktop', workgroupKey: Buffer.alloc(32, 7).toString('base64url') });
  for (const [peerIndex, device] of identities.entries()) if (peerIndex !== index) {
    registerSyncGroupDevice({ device, deviceName: String(peerIndex), platform: 'desktop' });
  }
  return db;
}

export async function seedMemberFacts(db: Database.Database) {
  const port = createBetterSqliteDbPort(db);
  const base = textBranch('original-base', '\ufeffOriginal 中文😀\0\r\n');
  const head = textBranch('current-head', 'Current complete body', base);
  await applyConvergentSyncNodesWithDbPort(port, [base, head]);
  for (const groupId of ['group-removal', 'another-group']) for (const identity of identities) {
    for (const statement of nodePositionWriteStatements({ group_id: groupId,
      device_identity_key: identity.identity_key, object_id: 'topic', library_epoch: 'original-epoch',
      adopted_version_id: 'original-base', pending_version_ids_json: '["current-head"]',
      proof_revision: 1, updated_at: '2026-10-14T00:00:00.000Z' })) {
      await port.run(statement.sql, statement.params);
    }
  }
  return originalFacts(db);
}

export function originalFacts(db: Database.Database) {
  return {
    nodes: db.prepare('SELECT * FROM nodes ORDER BY id').all(),
    versions: db.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all(),
    parents: db.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id, ordinal').all(),
    positions: db.prepare('SELECT * FROM node_version_member_positions ORDER BY fact_id').all()
  };
}

export function memberState(db: Database.Database, index: number) {
  return db.prepare('SELECT state FROM sync_group_devices WHERE group_id = ? AND device_identity_key = ?')
    .pluck().get('group-removal', identities[index]!.identity_key);
}
