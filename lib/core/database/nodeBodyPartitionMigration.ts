import type { DbPort } from '../sync/dbPort.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { PARTITION_ORDERS_SQL, partitionMigrationOrderChanges,
  writeCompanionPartitionMigrationOrders, writePartitionMigrationOrders } from './nodeBodyPartitionMigrationOrder.js';
import { nodeBodyMigrationPartPattern, PARTITION_ANCHORS_SQL, PARTITION_EXISTING_SQL, PARTITION_SOURCE_SQL,
  planNodeBodyMigrationPartitions, type ExistingPartition, type PartitionAnchor, type PartitionSource }
  from './nodeBodyPartitionMigrationPlan.js';

const CHILDREN = 'SELECT id FROM nodes WHERE parent_id = ? AND deleted_at IS NULL';
const MOVE = 'UPDATE nodes SET parent_id = ?, updated_at = ?, sync_dirty = 1 WHERE id = ?';
type Order = { parent_id: string; child_ids_json: string };

/** The enclosing schema transaction owns temporary restoration and every partition mutation. */
export function partitionNodeBodyDuringMigration(sqlite: DatabaseMigrationTarget, nodeId: string, text: string) {
  const node = sqlite.prepare(PARTITION_SOURCE_SQL).all(nodeId)[0] as PartitionSource | undefined;
  if (!node) throw new Error('body_partition_source_missing');
  const now = new Date().toISOString();
  const anchors = sqlite.prepare(PARTITION_ANCHORS_SQL).all(nodeId) as PartitionAnchor[];
  const existing = sqlite.prepare(PARTITION_EXISTING_SQL).all(nodeBodyMigrationPartPattern(nodeId)) as ExistingPartition[];
  const plan = planNodeBodyMigrationPartitions({ node, text, anchors, existing, now, searchInvalidations: true });
  const orders = sqlite.prepare(PARTITION_ORDERS_SQL).all() as Order[];
  for (const retired of plan.retired) {
    const children = sqlite.prepare(CHILDREN).all(retired.id) as Array<{ id: string }>;
    for (const child of children) {
      sqlite.prepare(MOVE).run(nodeId, now, child.id);
      plan.moved.push({ id: child.id, parentId: nodeId });
    }
  }
  for (const statement of plan.statements) sqlite.prepare(statement.sql).run(...statement.params);
  writePartitionMigrationOrders(sqlite, partitionMigrationOrderChanges(orders, plan.moved), now);
}

export async function partitionCompanionNodeBodyDuringMigration(db: DbPort, nodeId: string, text: string) {
  const [node] = await db.query<PartitionSource>(PARTITION_SOURCE_SQL, [nodeId]);
  if (!node) throw new Error('body_partition_source_missing');
  const now = new Date().toISOString();
  const anchors = await db.query<PartitionAnchor>(PARTITION_ANCHORS_SQL, [nodeId]);
  const existing = await db.query<ExistingPartition>(PARTITION_EXISTING_SQL, [nodeBodyMigrationPartPattern(nodeId)]);
  const plan = planNodeBodyMigrationPartitions({ node, text, anchors, existing, now, searchInvalidations: false });
  const orders = await db.query<Order>(PARTITION_ORDERS_SQL);
  for (const retired of plan.retired) {
    const children = await db.query<{ id: string }>(CHILDREN, [retired.id]);
    for (const child of children) {
      await db.run(MOVE, [nodeId, now, child.id]);
      plan.moved.push({ id: child.id, parentId: nodeId });
    }
  }
  for (const statement of plan.statements) await db.run(statement.sql, statement.params);
  await writeCompanionPartitionMigrationOrders(db, partitionMigrationOrderChanges(orders, plan.moved), now);
}
