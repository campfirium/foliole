import { reviewHistoryOpId } from '../review/reviewEventIdentity.js';
import type { DbPort } from '../sync/dbPort.js';

import type { DailyFlowCommitArgs, DailyFlowResult, DailyFlowSettings } from './dailyFlowContract.js';
import { readDailyFlow } from './dailyFlowStorage.js';
import { dailyFlowSyncFactSchema } from './dailyFlowSyncFact.js';
import { flowProgressDelta } from './dailyFlowSyncMerge.js';
import { writeDailyFlowSync } from './dailyFlowSyncWrites.js';

export async function recordDailyFlowSync(db: DbPort, result: DailyFlowResult, settings: DailyFlowSettings,
  now: string, command?: DailyFlowCommitArgs) {
  if (result.replayed) return;
  const [head] = await db.query<{ root_id: string; head_id: string; day_start: string }>(
    `SELECT p.root_id, p.head_id, f.day_start FROM daily_flow_sync_projection p
     JOIN daily_flow_sync_facts f ON f.id = p.head_id WHERE p.id = 1`);
  const sameDay = head && head.day_start === settings.dayWindow!.start;
  if (sameDay && !command) return;
  const id = command?.opId ?? crypto.randomUUID();
  const [latest] = await db.query<{ occurred_at: string }>(
    `SELECT MAX(occurred_at) AS occurred_at FROM daily_flow_sync_facts
      WHERE kind!='create' AND day_start<? AND day_end>?`, [settings.dayWindow!.end, settings.dayWindow!.start]);
  const occurredAt = new Date(Math.max(Date.parse(now), latest?.occurred_at ? Date.parse(latest.occurred_at) + 1 : 0)).toISOString();
  const session = { ...result.session, daily: undefined, candidateMembershipHash: undefined, rebuildSourceRevision: undefined };
  const history = command?.cycleReplay;
  const after = command?.historyMode === 'undo' ? history?.before : history?.after;
  const before = command?.historyMode === 'undo' ? history?.after : history?.before;
  const retained = new Set(after?.map(row => row.node_id));
  const fact = dailyFlowSyncFactSchema.parse({ id, rootId: sameDay ? head.root_id : id,
    parentId: sameDay ? head.head_id : null, occurredAt,
    kind: sameDay ? command?.historyMode ?? 'advance' : 'create',
    nodeId: command?.grade?.nodeId ?? command?.readings?.[0]?.nodeId ?? command?.reviewHistory?.nodeId ?? null,
    ...(command?.reviewHistory ? { reviewOpId: reviewHistoryOpId(command.reviewHistory.targetOpId, now, command.reviewHistory.mode), reviewTargetOpId: command.reviewHistory.targetOpId } : {}),
    ...(command?.readings ? { readings: command.readings } : {}),
    action: command?.grade ? 'grade' : command?.readingAction ?? (command?.historyMode ? 'history' : 'navigate'),
    statsDelta: flowProgressDelta(result.sourceSession, result.session),
    targetOpId: command?.historyTargetOpId ?? command?.reviewHistory?.targetOpId ?? null, mode: result.mode ?? (await readDailyFlow(db))?.mode ?? 'recommended',
    settings: { newDayStartsAtHour: settings.newDayStartsAtHour, pushQueue: settings.pushQueue, dayWindow: settings.dayWindow },
    session, rows: sameDay ? after ?? result.session.cycle?.change?.after ?? [] : [],
    removedNodeIds: before?.filter(row => !retained.has(row.node_id)).map(row => row.node_id) ?? [] });
  // Keep the local before rows alongside the canonical fact, including rebuilt source baselines.
  await writeDailyFlowSync(db, fact, result,
    result.session.cycle?.change?.before ?? command?.cycleReplay?.before, Boolean(command?.historyMode));
}
