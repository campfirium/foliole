import { hexToBytes } from '@noble/hashes/utils.js';

import type { CycleRow } from '../flow/cycleFlowTypes.js';
import type { DailyFlowFactRow } from '../flow/dailyFlowFactRowCodec.js';
import { readDailyFlowProjectionFacts } from '../flow/dailyFlowProjectionFacts.js';
import { readDailyFlow } from '../flow/dailyFlowStorage.js';

import type { DailyFlowTableBegin, DailyFlowTableRecord } from './dailyFlowTableContract.js';
import type { DbPort } from './dbPort.js';
import type { FramedSyncInventoryDifference } from './framedSyncInventory.js';

export async function selectDailyFlowTable(db: DbPort, difference: FramedSyncInventoryDifference) {
  const [requested] = await db.query<{ id: string; root_id: string; kind: string; day_start: string; day_end: string; occurred_at: string }>(
    'SELECT id,root_id,kind,day_start,day_end,occurred_at FROM daily_flow_sync_facts WHERE id=?', [difference.globalId]);
  if (!requested) throw new Error('framed_sync_source_changed');
  const [projection] = await db.query<{ root_id: string; head_id: string }>('SELECT root_id,head_id FROM daily_flow_sync_projection WHERE id=1');
  const purpose = requested.kind !== 'create' ? 'operation' : projection?.root_id === requested.id ? 'current_table' : 'root_history';
  const state = purpose === 'current_table' ? await readDailyFlow(db) : null;
  if (purpose === 'current_table' && !state) throw new Error('framed_sync_source_changed');
  const session = state ? structuredClone(state.session) : null;
  if (session) {
    delete session.daily;
    if (session.cycle?.change) { session.cycle.change.before = []; session.cycle.change.after = []; }
  }
  const begin: DailyFlowTableBegin = { listId: requested.root_id, purpose, snapshotId: crypto.randomUUID(),
    requestedFactId: requested.id, headId: state ? projection!.head_id : '', sessionJson: session ? JSON.stringify(session) : '',
    mode: state?.mode ?? '', memberCount: 0, factCount: 0 };
  const facts = await db.query<{ id: string }>(purpose === 'current_table'
    ? `SELECT id FROM daily_flow_sync_facts WHERE root_id=? OR root_id IN
      (SELECT f.root_id FROM daily_flow_sync_facts f JOIN daily_flow_projection_facts p ON p.fact_id=f.id) ORDER BY occurred_at,id`
    : purpose === 'root_history' ? 'SELECT id FROM daily_flow_sync_facts WHERE root_id=? ORDER BY occurred_at,id'
      : 'SELECT id FROM daily_flow_sync_facts WHERE id=?',
  [requested.id]);
  const applied = state ? await readDailyFlowProjectionFacts(db) : [];
  begin.factCount = facts.length;
  if (state) begin.memberCount = (await db.query<{ count: number }>('SELECT COUNT(*) AS count FROM daily_flow_entries'))[0]!.count;
  return { begin, facts: facts.map(row => row.id), applied, state };
}

export async function* dailyFlowTableRecords(db: DbPort, selected: Awaited<ReturnType<typeof selectDailyFlowTable>>): AsyncGenerator<DailyFlowTableRecord> {
  for (const id of selected.facts) {
    const [header] = await db.query<{ payload_json: string; content_hash: string }>(`SELECT f.payload_json,s.content_hash
      FROM daily_flow_sync_facts f JOIN sync_object_state s ON s.object_type='daily_flow' AND s.object_id=f.id WHERE f.id=?`, [id]);
    if (!header) throw new Error('framed_sync_source_changed');
    yield { fact: { factId: id, payloadJson: header.payload_json, contentHash: hexToBytes(header.content_hash) } };
    let slot = ''; let ordinal = -1;
    for (;;) {
      const rows = await db.query<DailyFlowFactRow>(`SELECT * FROM daily_flow_fact_rows WHERE fact_id=?
        AND (slot>? OR (slot=? AND ordinal>?)) ORDER BY slot,ordinal LIMIT 256`, [id, slot, slot, ordinal]);
      for (const row of rows) yield { row: { factId: id, slot: row.slot, ordinal: row.ordinal, nodeId: row.node_id,
        orderKey: row.order_key ?? 0, active: row.active ?? 0, cohort: row.cohort ?? '',
        handled: row.handled ?? 0, initialTask: row.initial_task ?? 0 } };
      if (rows.length < 256) break;
      slot = rows.at(-1)!.slot; ordinal = rows.at(-1)!.ordinal;
    }
  }
  for (const id of selected.applied) yield { appliedFactId: id };
  if (selected.state) {
    let after = 0; let ordinal = 0;
    for (;;) {
      const rows = await db.query<CycleRow & Record<string, unknown>>(
        'SELECT * FROM daily_flow_entries WHERE order_key>? ORDER BY order_key LIMIT 256', [after]);
      for (const row of rows) yield memberRecord(row, 'current', ordinal++);
      if (rows.length < 256) break;
      after = rows.at(-1)!.order_key;
    }
    for (const slot of ['before', 'after'] as const) {
      for (const [index, row] of (selected.state.session.cycle?.change?.[slot] ?? []).entries()) yield memberRecord(row, slot, index);
    }
    yield* dailyFlowDependencies(db);
  }
}

function memberRecord(row: CycleRow, slot: 'current' | 'before' | 'after', ordinal: number): DailyFlowTableRecord {
  return { member: { nodeId: row.node_id, orderKey: row.order_key, active: row.active, cohort: row.cohort,
    handled: row.handled, initialTask: row.initial_task, slot, ordinal } };
}

async function* dailyFlowDependencies(db: DbPort): AsyncGenerator<DailyFlowTableRecord> {
  let after = '';
  for (;;) {
    const rows = await db.query<{ id: string; current_version_id: string | null; content_hash: string | null; updated_at: string | null; last_handled_at: string | null; repetition_count: number | null }>(
      `SELECT n.id,n.current_version_id,s.content_hash,s.updated_at,r.last_handled_at,r.repetition_count FROM daily_flow_entries e JOIN nodes n ON n.id=e.node_id
      LEFT JOIN sync_object_state s ON s.object_type='node_reading' AND s.object_id=n.id
      LEFT JOIN node_reading r ON r.node_id=n.id
      WHERE n.id>? ORDER BY n.id LIMIT 256`, [after]);
    const reviews = await db.query<{ node_id: string; op_id: string }>(
      'SELECT node_id,op_id FROM review_log WHERE node_id IN (SELECT value FROM json_each(?)) ORDER BY node_id,op_id',
      [JSON.stringify(rows.map(row => row.id))]);
    for (const row of rows) {
      const ids = reviews.filter(review => review.node_id === row.id).map(review => review.op_id);
      for (const reviewFactId of ids.length ? ids : ['']) yield { dependency: { nodeId: row.id,
        versionId: row.current_version_id ?? '', readingHash: row.content_hash ?? '',
        readingUpdatedAt: row.updated_at ?? '', reviewFactId, readingLastHandledAt: row.last_handled_at ?? '',
        readingRepetitionCount: row.repetition_count ?? 0 } };
    }
    if (rows.length < 256) break;
    after = rows.at(-1)!.id;
  }
}
