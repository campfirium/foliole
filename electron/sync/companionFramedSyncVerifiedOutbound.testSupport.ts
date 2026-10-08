import Database from 'better-sqlite3';

import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { migrateCompanionFramedSyncInventory } from '../../lib/core/database/framedSyncInventoryMigration.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { decodeAndValidateProtocolMessage } from '../../lib/core/sync/framedSyncProtocolCodec.js';
import { readFramedSyncPublishedFactOperation } from '../../lib/core/sync/framedSyncPublishedFactOperation.js';
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
  return { sqlite, db, record, async retireObsoleteCache() {
    await db.run('DROP TABLE content_blob_data');
  } };
}

export async function facts(db: DbPort, value: { header_message_bytes: readonly number[]; transfer_id: string }) {
  const header = decodeAndValidateProtocolMessage(Uint8Array.from(value.header_message_bytes), 2);
  const count = (header.payload.manifest as { facts: unknown[] }).facts.length;
  const result = [];
  for (let index = 0; index < count; index += 1) {
    const read = await readFramedSyncPublishedFactOperation(db, { ...payload,
      transfer_id: value.transfer_id, fact_index: index, fragment_index: 0 });
    result.push(canonicalFactFromValidatedMessage(decodeAndValidateProtocolMessage(Uint8Array.from(read.message_bytes), 3)));
  }
  return result;
}
