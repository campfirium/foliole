import { NEXT_SYNC_STATE_SEQ_SQL } from '../database/syncStateSequenceSchemaStatements.js';
import type { DbPort } from '../sync/dbPort.js';
import { writeDbStatements, type DbStatement } from '../sync/dbStatements.js';

import type { CycleRow } from './cycleFlowTypes.js';
import type { DailyFlowResult } from './dailyFlowContract.js';
import { dailyFlowFactHash } from './dailyFlowFactHash.js';
import { dailyFlowFactStatements } from './dailyFlowFactStorage.js';
import { localFlowRowsStatement } from './dailyFlowLocalApplicationRows.js';
import type { DailyFlowSyncFact } from './dailyFlowSyncFact.js';
import { flowProgressDelta } from './dailyFlowSyncMerge.js';

export async function writeDailyFlowSync(db: DbPort, fact: DailyFlowSyncFact, result: DailyFlowResult,
  before?: CycleRow[], history = false) {
  const dayKey = result.session.daily!.dayKey;
  const statements: DbStatement[] = [];
  if (fact.nodeId) {
    const rows = before ?? await db.query<CycleRow>('SELECT * FROM daily_flow_entries WHERE node_id=?', [fact.nodeId]);
    statements.push(localFlowRowsStatement(dayKey, [fact.nodeId], rows));
  }
  statements.push(...dailyFlowFactStatements(fact));
  if (fact.kind !== 'create') statements.push({ sql: `INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty, deleted_at)
    VALUES ('daily_flow', ?, ${NEXT_SYNC_STATE_SEQ_SQL}, ?, 'local', ?, 1, NULL)`,
    params: [fact.id, dailyFlowFactHash(fact), fact.occurredAt] });
  statements.push({ sql: `INSERT INTO daily_flow_sync_projection (id, root_id, head_id) VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET merged=CASE WHEN root_id=excluded.root_id THEN merged ELSE 0 END,
    root_id=excluded.root_id, head_id=excluded.head_id`, params: [fact.rootId, fact.id] });
  if (fact.kind === 'create') statements.push(
    { sql: 'DELETE FROM daily_flow_local_operation_rows WHERE day_key!=?', params: [dayKey] },
    { sql: 'DELETE FROM daily_flow_local_operation_state WHERE day_key!=?', params: [dayKey] },
    { sql: 'INSERT OR IGNORE INTO daily_flow_local_operation_state(day_key,base_json) VALUES(?,?)',
      params: [dayKey, JSON.stringify(flowProgressDelta(undefined, result.session))] },
    { sql: 'DELETE FROM daily_flow_projection_facts' });
  else if (!history || !fact.targetOpId) statements.push({
    sql: 'INSERT OR IGNORE INTO daily_flow_projection_facts(fact_id) VALUES (?)', params: [fact.id] });
  await writeDbStatements(db, statements);
}
