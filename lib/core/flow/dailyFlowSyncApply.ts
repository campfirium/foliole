import { computeSyncContentHash } from '../database/syncState.js';
import type { DbPort } from '../sync/dbPort.js';
import type { SyncObjectRecord } from '../sync/syncObjectRecord.js';

import type { CycleRow } from './cycleFlowTypes.js';
import { insertCycleRows, readDailyFlow, saveCycleFlow } from './dailyFlowStorage.js';
import { readDailyFlowSyncFact, type DailyFlowSyncFact } from './dailyFlowSyncFact.js';

function decode(record: SyncObjectRecord) {
  if (record.deleted_at || !record.payload_json) throw new Error('daily_flow_sync_fact_invalid');
  const fact = readDailyFlowSyncFact(record.payload_json);
  if (fact.id !== record.object_id || fact.occurredAt !== record.updated_at ||
    computeSyncContentHash('daily_flow', JSON.parse(record.payload_json)) !== record.content_hash) {
    throw new Error('daily_flow_sync_fact_identity_invalid');
  }
  return fact;
}

export async function dailyFlowFactApplyStatus(db: DbPort, record: SyncObjectRecord) {
  const incoming = decode(record);
  const [existing] = await db.query<{ payload_json: string }>(
    'SELECT payload_json FROM daily_flow_sync_facts WHERE id = ?', [incoming.id]);
  if (!existing) return 'apply' as const;
  if (computeSyncContentHash('daily_flow', JSON.parse(existing.payload_json)) !== record.content_hash) {
    throw new Error('daily_flow_sync_operation_mismatch');
  }
  return 'already_applied' as const;
}

export async function applyDailyFlowSyncFact(db: DbPort, record: SyncObjectRecord) {
  const fact = decode(record);
  await db.run('INSERT INTO daily_flow_sync_facts VALUES (?, ?, ?, ?, ?)',
    [fact.id, fact.rootId, fact.occurredAt, fact.settings.dayWindow.start, JSON.stringify(fact)]);
  await projectSingleDailyFlowRoot(db);
}

/** Incomplete incoming chains remain durable facts until their create/parent facts arrive. */
async function projectSingleDailyFlowRoot(db: DbPort) {
  const records = await db.query<{ payload_json: string }>(
    `SELECT payload_json FROM daily_flow_sync_facts
     WHERE day_start = (SELECT MAX(day_start) FROM daily_flow_sync_facts) ORDER BY occurred_at, id`);
  const facts = records.map(row => readDailyFlowSyncFact(row.payload_json));
  const creates = facts.filter(fact => fact.kind === 'create');
  const latestDay = creates.map(fact => fact.settings.dayWindow.start).sort().at(-1);
  const roots = creates.filter(fact => fact.settings.dayWindow.start === latestDay);
  // Keep independent lists intact: adopting one must also merge their handled progress.
  if (roots.length !== 1) return;
  const root = roots[0]!;
  const parents = new Set<string>();
  for (const fact of facts.filter(value => value.rootId === root.id && value.parentId)) {
    if (parents.has(fact.parentId!)) return;
    parents.add(fact.parentId!);
  }
  const rows = new Map(root.rows.map(row => [row.node_id, row]));
  const applied = new Set([root.id]);
  let head = root;
  for (const fact of facts) {
    if (fact.rootId !== root.id || fact.kind === 'create' || !fact.parentId || !applied.has(fact.parentId)) continue;
    for (const id of fact.removedNodeIds) rows.delete(id);
    for (const row of fact.rows) rows.set(row.node_id, row);
    applied.add(fact.id);
    head = fact;
  }
  await installDailyFlowProjection(db, head, [...rows.values()]);
}

async function installDailyFlowProjection(db: DbPort, head: DailyFlowSyncFact, rows: CycleRow[]) {
  const stored = await readDailyFlow(db);
  const [projection] = await db.query<{ head_id: string }>('SELECT head_id FROM daily_flow_sync_projection WHERE id = 1');
  if (projection?.head_id === head.id) return;
  const localScope = stored ? (JSON.parse(stored.settings_key) as { scope?: string }).scope ?? '' : '';
  await db.run('DELETE FROM daily_flow_entries');
  await insertCycleRows(db, rows);
  await saveCycleFlow(db, { dayKey: head.settings.dayWindow.start, mode: stored?.mode ?? head.mode,
    settingsKey: JSON.stringify({ ...head.settings, scope: localScope }), now: head.occurredAt,
    revision: (stored?.revision ?? 0) + 1, session: { ...head.session, dayWindow: head.settings.dayWindow } });
  await db.run('UPDATE daily_flow_state SET invalidated = 1 WHERE id = 1');
  await db.run(`INSERT INTO daily_flow_sync_projection VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET root_id=excluded.root_id, head_id=excluded.head_id`, [head.rootId, head.id]);
}
