import { bytesToHex } from '@noble/hashes/utils.js';
import { z } from 'zod';

import { currentParentOrderHash, parseParentOrderSources, projectCurrentParentOrder,
  type ParentOrderSource } from '../sync/currentParentOrder.js';
import type { DbPort, DbRow } from '../sync/dbPort.js';
import { isBodyDescriptor } from '../sync/framedSyncBlobContract.js';
import { loadFramedSyncFrozenBody, UNOWNED_FRAMED_BODY, validateFramedSyncFrozenBody } from '../sync/framedSyncFrozenBody.js';

import { parentOrderPublicationProtectionStatements, parentOrderPublicationRetirementStatements,
  type ParentOrderUpgradeStatement } from './currentParentOrderPublicationStatements.js';
import { planParentOrderPublicationUpgrade, type ParentOrderUpgradedPublication } from './currentParentOrderPublicationUpgrade.js';
import { CURRENT_PARENT_ORDER_SCHEMA, PARENT_ORDER_MATERIALIZE_SQL, PARENT_ORDER_SOURCE_WRITE_SQL } from './currentParentOrderSchema.js';
import { framedSyncBytes } from './framedSyncStagingSerialization.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { NEXT_SYNC_STATE_SEQ_SQL } from './syncStateSequenceSchemaStatements.js';

const rowsSchema = z.array(z.record(z.string(), z.unknown()));
const ordersSql = 'SELECT parent_id, child_ids_json FROM parent_child_order ORDER BY parent_id';
const membersSql = `SELECT id, title, created_at AS createdAt,
  COALESCE(parent_id, 'parent-child-order:root') AS parentId FROM nodes`;
const publicationsSql = `SELECT publication.* FROM framed_sync_outbound_publications publication
  WHERE state = 'published' OR EXISTS (SELECT 1 FROM framed_sync_outbound_holds hold
    WHERE hold.transfer_id = publication.transfer_id)`;
const now = '1970-01-01T00:00:00.000Z';

const cleanupSql = [
  "DELETE FROM sync_object_state WHERE object_type IN ('order_version', 'parent_order_position')",
  `UPDATE sync_identity_partition_digest SET digest = NULL WHERE partition IN
    (SELECT partition FROM sync_identity_index_rows WHERE object_type IN ('order_version', 'parent_order_position'))`,
  "DELETE FROM sync_identity_index_rows WHERE object_type IN ('order_version', 'parent_order_position')",
  "DELETE FROM sync_identity_dirty_keys WHERE object_type IN ('order_version', 'parent_order_position')",
  'DROP TABLE IF EXISTS parent_order_heads', 'DROP TABLE IF EXISTS parent_order_member_positions',
  'DROP TABLE IF EXISTS parent_order_versions',
  'DELETE FROM framed_sync_session_send_states',
  "DELETE FROM framed_sync_inbound_transfers WHERE state != 'applied'",
  `DELETE FROM framed_sync_available_blobs WHERE ${UNOWNED_FRAMED_BODY}`,
  'DELETE FROM parent_order_projection_pending'
];

function seedPlan(orderRows: DbRow[], memberRows: DbRow[]) {
  const orders = z.array(z.object({ parent_id: z.string(), child_ids_json: z.string() })).parse(orderRows);
  const members = z.array(z.object({ id: z.string(), title: z.string(), createdAt: z.string(), parentId: z.string() })).parse(memberRows);
  const authorId = `initial-${globalThis.crypto.randomUUID()}`;
  const membersByParent = new Map<string, typeof members>();
  for (const member of members) {
    const group = membersByParent.get(member.parentId) ?? [];
    group.push(member);
    membersByParent.set(member.parentId, group);
  }
  const sources = new Map<string, ParentOrderSource[]>();
  const statements: ParentOrderUpgradeStatement[] = [];
  for (const row of orders) {
    const current = parseParentOrderSources([{ authorId, counter: 0, childIds: JSON.parse(row.child_ids_json) }]);
    sources.set(row.parent_id, current);
    statements.push({ sql: PARENT_ORDER_SOURCE_WRITE_SQL,
      params: [row.parent_id, authorId, 0, row.child_ids_json] });
    const order = projectCurrentParentOrder(current, membersByParent.get(row.parent_id) ?? []);
    statements.push({ sql: PARENT_ORDER_MATERIALIZE_SQL, params: [row.parent_id, JSON.stringify(order), now] });
    statements.push({ sql: `INSERT INTO sync_object_state
      (object_type, object_id, state_seq, current_version_id, content_hash, last_modified_by_host_name, updated_at, deleted_at, sync_dirty)
      VALUES ('parent_child_order', ?, ${NEXT_SYNC_STATE_SEQ_SQL}, NULL, ?, 'initial-order', ?, NULL, 1)
      ON CONFLICT(object_type, object_id) DO UPDATE SET state_seq = excluded.state_seq,
        current_version_id = NULL, content_hash = excluded.content_hash, deleted_at = NULL, sync_dirty = 1`,
    params: [row.parent_id, currentParentOrderHash(row.parent_id, current), now] });
  }
  return { sources, statements };
}

function publicationPlan(rows: DbRow[], sources: ReadonlyMap<string, ParentOrderSource[]>) {
  const publications = new Map<string, ParentOrderUpgradedPublication>();
  const retirements: ParentOrderUpgradeStatement[] = [];
  for (const row of rows) {
    for (const value of planParentOrderPublicationUpgrade(row, sources)) {
      publications.set(bytesToHex(value.transferId), value);
    }
    retirements.push(...parentOrderPublicationRetirementStatements(framedSyncBytes(row, 'transfer_id')));
  }
  return { publications: [...publications.values()], retirements };
}

function bodyOwners(publications: ParentOrderUpgradedPublication[]) {
  const blobs = new Map(publications.flatMap((value) => value.manifest.blobs
    .filter(isBodyDescriptor).map((blob) => [bytesToHex(blob.sha256), blob] as const)));
  return [...blobs.values()];
}

/** Runs inside the numbered schema transaction; any missing original body rolls back the entire upgrade. */
export function migrateCurrentParentOrders(sqlite: DatabaseMigrationTarget) {
  for (const sql of CURRENT_PARENT_ORDER_SCHEMA) sqlite.exec(sql);
  const columns = rowsSchema.parse(sqlite.prepare('PRAGMA table_info(framed_sync_outbound_publications)').all());
  if (!columns.some((column) => column.name === 'retirement_reason')) {
    sqlite.exec('ALTER TABLE framed_sync_outbound_publications ADD COLUMN retirement_reason TEXT');
  }
  const seed = seedPlan(rowsSchema.parse(sqlite.prepare(ordersSql).all()), rowsSchema.parse(sqlite.prepare(membersSql).all()));
  const outbound = publicationPlan(rowsSchema.parse(sqlite.prepare(publicationsSql).all()), seed.sources);
  for (const blob of bodyOwners(outbound.publications)) {
    const [row] = rowsSchema.parse(sqlite.prepare('SELECT data FROM framed_sync_available_blobs WHERE sha256 = ?').all(blob.sha256));
    if (!row) throw new Error('parent_order_upgrade_frozen_body_missing');
    validateFramedSyncFrozenBody(blob, framedSyncBytes(row, 'data'));
  }
  const statements = [...seed.statements, ...outbound.publications.flatMap(parentOrderPublicationProtectionStatements), ...outbound.retirements];
  for (const statement of statements) sqlite.prepare(statement.sql).run(...statement.params);
  for (const sql of cleanupSql) sqlite.exec(sql);
}

export async function migrateCompanionCurrentParentOrders(port: DbPort) {
  for (const sql of CURRENT_PARENT_ORDER_SCHEMA) await port.run(sql);
  const columns = await port.query('PRAGMA table_info(framed_sync_outbound_publications)');
  if (!columns.some((column) => column.name === 'retirement_reason')) {
    await port.run('ALTER TABLE framed_sync_outbound_publications ADD COLUMN retirement_reason TEXT');
  }
  const seed = seedPlan(await port.query(ordersSql), await port.query(membersSql));
  const outbound = publicationPlan(await port.query(publicationsSql), seed.sources);
  for (const blob of bodyOwners(outbound.publications)) {
    await loadFramedSyncFrozenBody(port, blob);
  }
  const statements = [...seed.statements, ...outbound.publications.flatMap(parentOrderPublicationProtectionStatements), ...outbound.retirements];
  for (const statement of statements) await port.run(statement.sql, statement.params);
  for (const sql of cleanupSql) await port.run(sql);
}
