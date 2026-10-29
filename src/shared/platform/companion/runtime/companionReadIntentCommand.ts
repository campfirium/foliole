import type { DailyFlowCommitArgs } from '../../../../../lib/core/flow/dailyFlowContract';
import { readDailyFlowFact } from '../../../../../lib/core/flow/dailyFlowFactStorage';
import { flowDay } from '../../../../../lib/core/flow/dailyFlowPlanning';
import { openDailyFlow } from '../../../../../lib/core/flow/dailyFlowService';
import { readDailyFlow } from '../../../../../lib/core/flow/dailyFlowStorage';
import type { ReadIntent, ReadIntentRow } from '../../../../../lib/core/flow/readIntentJournal';
import { reviewCalendarDayKey } from '../../../../../lib/core/review/reviewCalendarDates';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import type { Node } from '../../../../features/nodes/model/nodeTypes';
import { buildNextReadingProfile } from '../../../../store/workspaceReviewReading';
import { buildNextReadingReviewState } from '../../../../store/workspaceStoreReadingReviewSchedule';
import { createTopicDismissHistoryEntry } from '../../../../store/workspaceTopicDismissActionHistory';

import { companionDailyFlowPersistence } from './companionDailyFlow';

export async function isReadIntentApplied(db: DbPort, row: ReadIntentRow) {
  const fact = await readDailyFlowFact(db, row.intent.id);
  if (!fact) return false;
  if (fact.action !== 'read' || fact.nodeId !== row.intent.nodeId || !row.command ||
    JSON.stringify(fact.readings) !== JSON.stringify(row.command.readings?.map(({ nodeId, before, after }) => ({ nodeId, before, after })))) throw new Error('read_intent_fact_mismatch');
  return true;
}

export async function prepareReadIntentCommand(db: DbPort, intent: ReadIntent) {
  const stored = await readDailyFlow(db);
  // A stale click is never redirected, and yesterday's cursor never replaces today's.
  if (!stored || stored.day_key !== intent.dayKey || stored.mode !== intent.mode ||
    stored.day_key !== flowDay(intent.now, intent.settings)) return null;
  const opened = await openDailyFlow(db, { now: intent.now, mode: intent.mode }, intent.settings, companionDailyFlowPersistence);
  if (opened.session.currentNodeId !== intent.nodeId) return null;
  const snapshot = await readTargetAndAncestors(db, intent.nodeId);
  const currentNode = snapshot.nodesById[intent.nodeId];
  if (!currentNode) return null;
  const before = currentNode.reading ?? null;
  const after = buildNextReadingProfile(buildNextReadingReviewState({
    currentNode: currentNode as Node, currentNodeId: intent.nodeId, now: intent.now, snapshot: snapshot as unknown as { nodesById: Record<string, Node> }, pushQueue: intent.settings.pushQueue
  }), before);
  const session = opened.session;
  const command: DailyFlowCommitArgs = { opId: intent.id, now: intent.now, token: session.daily!,
    sourceSession: session, readingAction: 'read', readings: [{ nodeId: intent.nodeId,
      before, after, completedReviewDay: reviewCalendarDayKey(new Date(intent.now), intent.settings.newDayStartsAtHour) }] };
  const context = { activeNodeId: intent.nodeId, browseRootNodeId: '', reviewSession: session };
  const entry = createTopicDismissHistoryEntry({ id: intent.id, nodeId: intent.nodeId,
    mutationTimestamp: intent.now, title: 'Read Topic', beforeContext: context, afterContext: context,
    beforeReading: before, afterReading: after });
  return { command, entry };
}

async function readTargetAndAncestors(db: DbPort, nodeId: string) {
  const snapshot = { nodeOrder: [nodeId], nodesById: {} as Awaited<ReturnType<typeof companionDailyFlowPersistence.snapshot>>['nodesById'],
    trashedNodeIds: [] as string[] };
  let id: string | null = nodeId;
  while (id && !snapshot.nodesById[id]) {
    const part = await companionDailyFlowPersistence.snapshot(db, [id]);
    const node: typeof part.nodesById[string] | undefined = part.nodesById[id];
    if (!node) break;
    snapshot.nodesById[id] = node;
    snapshot.trashedNodeIds.push(...part.trashedNodeIds);
    id = node.parentNodeId;
  }
  return snapshot;
}

export async function assertReadIntentLibrary(db: DbPort, libraryId: string) {
  const [row] = await db.query<{ value: string }>("SELECT value FROM companion_meta WHERE key='read_intent_library_id'");
  if (row?.value !== libraryId) throw new Error('read_intent_library_changed');
}

export async function correctReadIntent(db: DbPort, intent: ReadIntent) {
  const stored = await readDailyFlow(db);
  if (!stored) return null;
  if (stored.day_key !== intent.dayKey || stored.mode !== intent.mode) return {
    session: stored.session, mode: stored.mode as ReadIntent['mode'] };
  return { ...await openDailyFlow(db, { now: intent.now, mode: intent.mode }, intent.settings,
    companionDailyFlowPersistence), mode: intent.mode };
}
