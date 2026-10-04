import type { DbPort, DbRow } from '../sync/dbPort.js';
import { parentOrderFactStateStatement } from '../sync/syncParentOrderFact.js';
import { PARENT_ORDER_BASELINE_TIME, parentOrderBaselineVersionId,
  PARENT_ORDER_VERSION_SCHEMA } from '../sync/syncParentOrderVersionStore.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';

interface OrderRow extends DbRow { parent_id: string; child_ids_json: string }

/** Capture only the current legacy arrangement; earlier history is unknowable. */
export function migrateParentOrderVersions(sqlite: DatabaseMigrationTarget) {
  for (const statement of PARENT_ORDER_VERSION_SCHEMA) sqlite.exec(statement);
  const rows = sqlite.prepare(`SELECT parent_id, child_ids_json
    FROM parent_child_order ORDER BY parent_id`).all() as OrderRow[];
  const insert = sqlite.prepare(`INSERT INTO parent_order_versions
    (version_id, parent_id, kind, child_ids_json, parent_version_ids_json, created_at)
    VALUES (?, ?, 'baseline', ?, '[]', ?)`);
  const head = sqlite.prepare(`INSERT INTO parent_order_heads (parent_id, version_id) VALUES (?, ?)`);
  for (const row of rows) {
    const order = JSON.parse(row.child_ids_json) as string[];
    const id = parentOrderBaselineVersionId(row.parent_id, order);
    insert.run(id, row.parent_id, JSON.stringify(order), PARENT_ORDER_BASELINE_TIME);
    head.run(row.parent_id, id);
    const state = parentOrderFactStateStatement(row.parent_id, { versionId: id,
      kind: 'baseline', order, parentVersionIds: [] }, PARENT_ORDER_BASELINE_TIME);
    sqlite.prepare(state.sql).run(...state.params);
    sqlite.prepare(`UPDATE sync_object_state SET current_version_id = ?
      WHERE object_type = 'parent_child_order' AND object_id = ?`).run(id, row.parent_id);
  }
}

export async function migrateCompanionParentOrderVersions(port: DbPort) {
  for (const statement of PARENT_ORDER_VERSION_SCHEMA) await port.run(statement);
  const rows = await port.query<OrderRow>(`SELECT parent_id, child_ids_json
    FROM parent_child_order ORDER BY parent_id`);
  for (const row of rows) {
    const order = JSON.parse(row.child_ids_json) as string[];
    const id = parentOrderBaselineVersionId(row.parent_id, order);
    await port.run(`INSERT INTO parent_order_versions
      (version_id, parent_id, kind, child_ids_json, parent_version_ids_json, created_at)
      VALUES (?, ?, 'baseline', ?, '[]', ?)`,
    [id, row.parent_id, JSON.stringify(order), PARENT_ORDER_BASELINE_TIME]);
    await port.run(`INSERT INTO parent_order_heads (parent_id, version_id) VALUES (?, ?)`,
      [row.parent_id, id]);
    const state = parentOrderFactStateStatement(row.parent_id, { versionId: id,
      kind: 'baseline', order, parentVersionIds: [] }, PARENT_ORDER_BASELINE_TIME);
    await port.run(state.sql, state.params);
    await port.run(`UPDATE sync_object_state SET current_version_id = ?
      WHERE object_type = 'parent_child_order' AND object_id = ?`, [id, row.parent_id]);
  }
}
