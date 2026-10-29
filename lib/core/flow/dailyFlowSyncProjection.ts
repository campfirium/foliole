import type { DbPort } from '../sync/dbPort.js';

import type { CycleRow } from './cycleFlowTypes.js';
import { appendDailyFlowProjectionFact, replaceDailyFlowProjectionFacts } from './dailyFlowProjectionFacts.js';
import type { DailyFlowSession } from './dailyFlowSession.js';
import { insertCycleRows, readDailyFlow, saveCycleFlow, writeCycleRows } from './dailyFlowStorage.js';
import { type DailyFlowSyncFact } from './dailyFlowSyncFact.js';
import { readRelatedDailyFlowFacts } from './dailyFlowSyncFacts.js';
import { connectedFlowFacts, mergeDailyFlowFacts } from './dailyFlowSyncMerge.js';

type ProjectionHead = { root_id: string; head_id: string; merged: number };

async function writeProjection(db: DbPort, head: DailyFlowSyncFact, session: DailyFlowSession, merged: boolean) {
  const stored = await readDailyFlow(db);
  const localScope = stored ? (JSON.parse(stored.settings_key) as { scope?: string }).scope ?? '' : '';
  await saveCycleFlow(db, { dayKey: head.settings.dayWindow.start, mode: stored?.mode ?? head.mode,
    settingsKey: JSON.stringify({ ...head.settings, scope: localScope }), now: head.occurredAt,
    revision: (stored?.revision ?? 0) + 1, session: { ...session, dayWindow: head.settings.dayWindow } });
  await db.run('UPDATE daily_flow_state SET invalidated = 1 WHERE id = 1');
  await db.run(`INSERT INTO daily_flow_sync_projection (id, root_id, head_id, merged) VALUES (1, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET root_id=excluded.root_id, head_id=excluded.head_id, merged=excluded.merged`,
  [head.rootId, head.id, merged ? 1 : 0]);
}

async function applyLinearSuccessor(db: DbPort, fact: DailyFlowSyncFact, head: ProjectionHead | undefined) {
  if ((fact.kind === 'undo' || fact.kind === 'redo') && fact.targetOpId) return false;
  if (!head || head.merged || head.root_id !== fact.rootId || head.head_id !== fact.parentId) return false;
  const waiting = await db.query('SELECT 1 FROM daily_flow_sync_facts WHERE root_id=? AND parent_id=? LIMIT 1', [fact.rootId, fact.id]);
  if (waiting.length) return false;
  await db.run('DELETE FROM daily_flow_entries WHERE node_id IN (SELECT value FROM json_each(?))', [JSON.stringify(fact.removedNodeIds)]);
  await writeCycleRows(db, fact.rows);
  await writeProjection(db, fact, fact.session, false);
  await appendDailyFlowProjectionFact(db, fact.id);
  return true;
}

export async function projectDailyFlowSync(db: DbPort, incoming?: DailyFlowSyncFact, refresh = false) {
  const [head] = await db.query<ProjectionHead>('SELECT root_id, head_id, merged FROM daily_flow_sync_projection WHERE id=1');
  if (refresh && !head?.merged) return;
  if (incoming && await applyLinearSuccessor(db, incoming, head)) return;
  const facts = await readRelatedDailyFlowFacts(db);
  const ids = [...new Set(facts.flatMap(fact => fact.rows.map(row => row.node_id)))];
  const types = ids.length ? await db.query<{ id: string; kind: string }>(
    'SELECT id, kind FROM nodes WHERE id IN (SELECT value FROM json_each(?))', [JSON.stringify(ids)]) : [];
  const result = mergeDailyFlowFacts(facts, new Map(types.map(row => [row.id, row.kind])));
  if (!result || (!result.merged && head?.head_id === result.head.id)) return;
  await db.run('DELETE FROM daily_flow_entries');
  await insertCycleRows(db, result.rows as CycleRow[]);
  await writeProjection(db, result.head, result.session, result.merged);
  await replaceDailyFlowProjectionFacts(db, connectedFlowFacts(facts).map(fact => fact.id));
}
