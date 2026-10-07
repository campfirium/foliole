import Database from 'better-sqlite3';

import { migrateBodyContentStorage } from '../../lib/core/database/bodyContentMigration.js';
import { migrateBodyContentOwners } from '../../lib/core/database/bodyContentOwnerMigration.js';
import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { migrateCompanionFramedSyncInventory } from '../../lib/core/database/framedSyncInventoryMigration.js';
import { migrateVerifiedBodyInventory } from '../../lib/core/database/verifiedBodyInventoryMigration.js';
import { decodeAndValidateProtocolMessage } from '../../lib/core/sync/framedSyncProtocolCodec.js';
import { canonicalFactFromValidatedMessage } from '../../lib/core/sync/framedSyncWireFact.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { textBranch } from '../database/topicTextState.testSupport.js';

export const time = '2026-10-07T00:00:00.000Z';
export const payload = { group_id: 'group', include_current_node: true, object_id: 'topic', object_type: 'node',
  receiver_device_id: 'receiver', receiver_library_epoch: 'receiver-epoch', sender_device_id: 'sender',
  sender_library_epoch: 'sender-epoch', required_relation_ids: [], review_fact_ids: [], state_fact_ids: [] };

export async function source(body: string) {
  const sqlite = new Database(':memory:');
  sqlite.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
  const db = createBetterSqliteDbPort(sqlite);
  await migrateCompanionFramedSyncInventory(db);
  const record = textBranch('version-1', body, undefined, time);
  await applyConvergentSyncNodesWithDbPort(db, [record]);
  return { sqlite, db, record, async migrate() {
    await db.transaction(async (tx) => {
      await migrateBodyContentStorage(tx);
      await migrateBodyContentOwners(tx, 'companion');
      await migrateVerifiedBodyInventory(tx);
      await tx.run('DROP TABLE content_blob_data');
    });
  } };
}

export function facts(value: { fact_message_bytes_list: readonly (readonly number[])[] }) {
  return value.fact_message_bytes_list.map((bytes) =>
    canonicalFactFromValidatedMessage(decodeAndValidateProtocolMessage(Uint8Array.from(bytes), 3)));
}
