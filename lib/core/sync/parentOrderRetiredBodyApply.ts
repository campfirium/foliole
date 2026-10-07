import type { DbPort, DbRow } from './dbPort.js';
import { parentOrderIdentityStateStatement, parseManagedParentOrderFact } from './syncParentOrderFact.js';

/** Identity-only delivery cannot erase an arrangement held for local obligations. */
export async function applyRetiredParentOrderBody(db: DbPort, raw: unknown, originalHash: string) {
  const fact = parseManagedParentOrderFact(raw);
  if (fact.version.order !== null || !/^[a-f0-9]{64}$/u.test(originalHash)) {
    throw new Error('sync_parent_order_fact_hash_mismatch');
  }
  const [existing] = await db.query<DbRow>('SELECT * FROM parent_order_versions WHERE version_id = ?',
    [fact.version.versionId]);
  const [state] = await db.query<{ content_hash: string }>(`SELECT content_hash FROM sync_object_state
    WHERE object_type = 'order_version' AND object_id = ?`, [fact.version.versionId]);
  if (existing) {
    const previous = parseManagedParentOrderFact(existing);
    if (previous.parentId !== fact.parentId || previous.createdAt !== fact.createdAt ||
        previous.version.kind !== fact.version.kind ||
        JSON.stringify(previous.version.parentVersionIds) !== JSON.stringify(fact.version.parentVersionIds) ||
        state?.content_hash !== originalHash) throw new Error('sync_parent_order_fact_collision');
    return;
  }
  for (const id of fact.version.parentVersionIds) {
    const [parent] = await db.query<{ parent_id: string }>(
      'SELECT parent_id FROM parent_order_versions WHERE version_id = ?', [id]);
    if (parent && parent.parent_id !== fact.parentId) throw new Error('sync_parent_order_lineage_unproven');
  }
  await db.run(`INSERT INTO parent_order_versions
    (version_id, parent_id, kind, child_ids_json, parent_version_ids_json, created_at)
    VALUES (?, ?, ?, 'null', ?, ?)`, [fact.version.versionId, fact.parentId, fact.version.kind,
    JSON.stringify(fact.version.parentVersionIds), fact.createdAt]);
  const statement = parentOrderIdentityStateStatement(fact.version.versionId, originalHash, fact.createdAt);
  await db.run(statement.sql, statement.params);
}
