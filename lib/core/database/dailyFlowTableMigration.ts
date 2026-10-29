import { dailyFlowFactHash } from '../flow/dailyFlowFactHash.js';
import { joinDailyFlowRows, separateDailyFlowRows } from '../flow/dailyFlowFactRowCodec.js';
import { INSERT_DAILY_FLOW_FACT_ROWS, readDailyFlowFact } from '../flow/dailyFlowFactStorage.js';
import { readDailyFlowSyncFact, type DailyFlowSyncFact } from '../flow/dailyFlowSyncFact.js';
import { connectedFlowFacts } from '../flow/dailyFlowSyncMerge.js';
import type { DbPort } from '../sync/dbPort.js';

import { DAILY_FLOW_TABLE_SCHEMA } from './dailyFlowTableSchema.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { computeSyncContentHash } from './syncState.js';

type LegacyFact = { id: string; payload_json: string; content_hash: string | null };
const nextFact = `SELECT f.id, f.payload_json, s.content_hash FROM daily_flow_sync_facts f
  LEFT JOIN sync_object_state s ON s.object_type='daily_flow' AND s.object_id=f.id
  WHERE f.id > ? ORDER BY f.id LIMIT 1`;
const update = 'UPDATE daily_flow_sync_facts SET payload_json=? WHERE id=?';
const root = 'INSERT INTO daily_flow_lists(list_id,row_count,complete) VALUES (?,?,1)';

function convert(row: LegacyFact) {
  const original = JSON.parse(row.payload_json);
  const fact = readDailyFlowSyncFact(row.payload_json);
  const { header, rows } = separateDailyFlowRows(fact);
  const restored = joinDailyFlowRows(JSON.stringify(header), rows);
  const hash = computeSyncContentHash('daily_flow', original);
  if (hash !== dailyFlowFactHash(restored) || (row.content_hash && row.content_hash !== hash)) {
    throw new Error('daily_flow_table_migration_hash_mismatch');
  }
  return { fact, header: JSON.stringify(header), rows };
}

function appliedIds(facts: DailyFlowSyncFact[], head: { head_id: string; merged: number } | undefined) {
  if (!head) return [];
  const byId = new Map(facts.map(fact => [fact.id, fact]));
  const selected = byId.get(head.head_id);
  if (!selected) return [];
  const related = facts.filter(fact => fact.settings.dayWindow.start <= selected.occurredAt &&
    fact.settings.dayWindow.end > selected.occurredAt);
  if (head.merged) return connectedFlowFacts(related).map(fact => fact.id);
  const path: string[] = [];
  let current: DailyFlowSyncFact | undefined = selected;
  while (current) {
    if (path.includes(current.id)) throw new Error('daily_flow_table_migration_parent_cycle');
    path.push(current.id);
    if (!current.parentId) break;
    current = byId.get(current.parentId);
    if (!current) return [];
  }
  return path;
}

/** The numbered migration runner owns the enclosing schema transaction. */
export function migrateDailyFlowTables(db: DatabaseMigrationTarget) {
  for (const statement of DAILY_FLOW_TABLE_SCHEMA) db.exec(statement);
  let after = '';
  const facts: DailyFlowSyncFact[] = [];
  for (;;) {
    const [row] = db.prepare(nextFact).all(after) as LegacyFact[];
    if (!row) break;
    const value = convert(row);
    for (let offset = 0; offset < value.rows.length; offset += 256) {
      db.prepare(INSERT_DAILY_FLOW_FACT_ROWS).run(JSON.stringify(value.rows.slice(offset, offset + 256)));
    }
    db.prepare(update).run(value.header, row.id);
    if (value.fact.kind === 'create') db.prepare(root).run(row.id, value.fact.rows.length);
    facts.push(readDailyFlowSyncFact(value.header)); after = row.id;
  }
  const [head] = db.prepare('SELECT head_id, merged FROM daily_flow_sync_projection WHERE id=1').all() as {
    head_id: string; merged: number;
  }[];
  for (const id of appliedIds(facts, head)) db.prepare('INSERT INTO daily_flow_projection_facts VALUES (?)').run(id);
}

export async function migrateCompanionDailyFlowTables(db: DbPort) {
  for (const statement of DAILY_FLOW_TABLE_SCHEMA) await db.run(statement);
  let after = '';
  const facts: DailyFlowSyncFact[] = [];
  for (;;) {
    const [row] = await db.query<LegacyFact>(nextFact, [after]);
    if (!row) break;
    const value = convert(row);
    for (let offset = 0; offset < value.rows.length; offset += 256) {
      await db.run(INSERT_DAILY_FLOW_FACT_ROWS, [JSON.stringify(value.rows.slice(offset, offset + 256))]);
    }
    await db.run(update, [value.header, row.id]);
    if (value.fact.kind === 'create') await db.run(root, [row.id, value.fact.rows.length]);
    const restored = await readDailyFlowFact(db, row.id);
    if (!restored || dailyFlowFactHash(restored) !== dailyFlowFactHash(value.fact)) {
      throw new Error('daily_flow_table_migration_hash_mismatch');
    }
    facts.push(readDailyFlowSyncFact(value.header)); after = row.id;
  }
  const [head] = await db.query<{ head_id: string; merged: number }>(
    'SELECT head_id, merged FROM daily_flow_sync_projection WHERE id=1');
  for (const id of appliedIds(facts, head)) await db.run('INSERT INTO daily_flow_projection_facts VALUES (?)', [id]);
}
