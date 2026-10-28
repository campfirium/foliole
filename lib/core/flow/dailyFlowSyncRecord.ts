import { computeSyncContentHash } from '../database/syncState.js';
import { NEXT_SYNC_STATE_SEQ_SQL } from '../database/syncStateSequenceSchemaStatements.js';
import type { DbPort } from '../sync/dbPort.js';

import type { CycleRow } from './cycleFlowTypes.js';
import type { DailyFlowCommitArgs, DailyFlowResult, DailyFlowSettings } from './dailyFlowContract.js';
import { readCycleRows, readDailyFlow } from './dailyFlowStorage.js';
import { dailyFlowSyncFactSchema } from './dailyFlowSyncFact.js';
import { flowProgressDelta } from './dailyFlowSyncMerge.js';

export async function recordDailyFlowSync(db: DbPort, result: DailyFlowResult, settings: DailyFlowSettings,
  now: string, command?: DailyFlowCommitArgs, createdRows?: CycleRow[]) {
  if (result.replayed) return;
  const [head] = await db.query<{ root_id: string; head_id: string; day_start: string }>(
    `SELECT p.root_id, p.head_id, f.day_start FROM daily_flow_sync_projection p
     JOIN daily_flow_sync_facts f ON f.id = p.head_id WHERE p.id = 1`);
  const sameDay = head && head.day_start === settings.dayWindow!.start;
  if (sameDay && !command) return;
  const id = command?.opId ?? crypto.randomUUID();
  const [latest] = await db.query<{ occurred_at: string }>(
    'SELECT MAX(occurred_at) AS occurred_at FROM daily_flow_sync_facts WHERE root_id = ?', [sameDay ? head.root_id : id]);
  const occurredAt = new Date(Math.max(Date.parse(now), latest?.occurred_at ? Date.parse(latest.occurred_at) + 1 : 0)).toISOString();
  const session = { ...result.session, daily: undefined };
  const history = command?.cycleReplay;
  const after = command?.historyMode === 'undo' ? history?.before : history?.after;
  const before = command?.historyMode === 'undo' ? history?.after : history?.before;
  const retained = new Set(after?.map(row => row.node_id));
  const fact = dailyFlowSyncFactSchema.parse({ id, rootId: sameDay ? head.root_id : id,
    parentId: sameDay ? head.head_id : null, occurredAt,
    kind: sameDay ? command?.historyMode ?? 'advance' : 'create',
    nodeId: command?.grade?.nodeId ?? command?.readings?.[0]?.nodeId ?? command?.reviewHistory?.nodeId ?? null,
    action: command?.grade ? 'grade' : command?.readingAction ?? (command?.historyMode ? 'history' : 'navigate'),
    statsDelta: flowProgressDelta(result.sourceSession, result.session),
    targetOpId: command?.reviewHistory?.targetOpId ?? null, mode: result.mode ?? (await readDailyFlow(db))?.mode ?? 'recommended',
    settings: { newDayStartsAtHour: settings.newDayStartsAtHour, pushQueue: settings.pushQueue, dayWindow: settings.dayWindow },
    session, rows: sameDay ? after ?? result.session.cycle?.change?.after ?? [] : createdRows ?? await readCycleRows(db),
    removedNodeIds: before?.filter(row => !retained.has(row.node_id)).map(row => row.node_id) ?? [] });
  // The ordinary Sync object hash protects transport content; it is not a per-row Flow fingerprint.
  const hash = computeSyncContentHash('daily_flow', JSON.parse(JSON.stringify(fact)));
  await db.run(`INSERT INTO daily_flow_sync_facts
    (id, root_id, occurred_at, day_start, payload_json, day_end, parent_id, kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, fact.rootId, occurredAt, fact.settings.dayWindow.start, JSON.stringify(fact),
      fact.settings.dayWindow.end, fact.parentId, fact.kind]);
  await db.run(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty, deleted_at)
    VALUES ('daily_flow', ?, ${NEXT_SYNC_STATE_SEQ_SQL}, ?, 'local', ?, 1, NULL)`, [id, hash, occurredAt]);
  await db.run(`INSERT INTO daily_flow_sync_projection (id, root_id, head_id) VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET merged=CASE WHEN root_id=excluded.root_id THEN merged ELSE 0 END,
    root_id=excluded.root_id, head_id=excluded.head_id`, [fact.rootId, id]);
}
