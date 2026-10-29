import { hexToBytes } from '@noble/hashes/utils.js';

import type { DailyFlowFactRow } from '../flow/dailyFlowFactRowCodec.js';

import type { DailyFlowTableBegin, DailyFlowTableRecord } from './dailyFlowTableContract.js';
import type { DbPort } from './dbPort.js';
import type { FramedSyncInventoryDifference } from './framedSyncInventory.js';

export async function selectDailyFlowTable(db: DbPort, difference: FramedSyncInventoryDifference) {
  const [requested] = await db.query<{ root_id: string; kind: string }>(
    'SELECT root_id,kind FROM daily_flow_sync_facts WHERE id=?', [difference.globalId]);
  if (!requested) throw new Error('framed_sync_source_changed');
  if (requested.kind === 'create') throw new Error('daily_flow_local_list_not_transferable');
  const begin: DailyFlowTableBegin = { listId: requested.root_id, purpose: 'operation', snapshotId: crypto.randomUUID(),
    requestedFactId: difference.globalId, headId: '', sessionJson: '', mode: '', memberCount: 0, factCount: 1 };
  return { begin, facts: [difference.globalId] };
}

export async function* dailyFlowTableRecords(db: DbPort,
  selected: Awaited<ReturnType<typeof selectDailyFlowTable>>): AsyncGenerator<DailyFlowTableRecord> {
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
}
