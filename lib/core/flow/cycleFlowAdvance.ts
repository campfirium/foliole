import { isFsrsReviewItemNode } from '../review/reviewItemKind.js';

import { cycleChanges } from './cycleFlowChanges.js';
import { chooseCycleCurrent, isCycleCurrentReady } from './cycleFlowOpen.js';
import { allocateCycleKey } from './cycleFlowState.js';
import type { DailyFlowCommitArgs, DailyFlowSettings, DailyFlowLearningSnapshot } from './dailyFlowContract.js';
import { fullDayCandidates } from './dailyFlowPlanning.js';
import type { DailyFlowSession } from './dailyFlowSession.js';
import type { DailyFlowStore } from './dailyFlowStore.js';
import { calculateReviewStepElapsedMs, resolveEarliestReviewDueAt } from './flowSessionProgress.js';

export async function advanceCycleFlow(db: DailyFlowStore, source: DailyFlowSession, args: DailyFlowCommitArgs,
  snapshot: DailyFlowLearningSnapshot, settings: DailyFlowSettings,
  mode: Parameters<typeof chooseCycleCurrent>[2]) {
  const cycle = { ...source.cycle! };
  delete cycle.change;
  const changes = cycleChanges(cycle);
  const ids = [...new Set([args.grade?.nodeId, ...(args.readings ?? []).map(value => value.nodeId)]
    .filter((id): id is string => Boolean(id)))];
  const rows = new Map((await db.readRows(ids)).map(row => [row.node_id, row]));
  const eligible = new Set(fullDayCandidates(snapshot, args.now, settings));
  const current = source.currentNodeId!;
  for (const id of ids) {
    const before = rows.get(id);
    const active = eligible.has(id) || (id === current && args.readingAction === 'soon');
    if (before?.initial_task && before.active) {
      cycle.remaining -= 1;
      if (isFsrsReviewItemNode(snapshot.nodesById[id])) cycle.reviewRemaining -= 1;
    }
    if (!before && !active) continue;
    changes.set(before, { node_id: id, order_key: active ? allocateCycleKey(cycle) : before!.order_key,
      active: active ? 1 : 0, handled: id === current ? 1 : before?.handled ?? 0, cohort: id === current && args.readingAction === 'soon' ? 'soon' : 'none', initial_task: 0 });
  }
  await db.writeRows(changes.rows());
  const initial = rows.get(current)?.handled === 0;
  const elapsed = calculateReviewStepElapsedMs(source, args.now);
  const session = { ...source, cycle,
    readingElapsedMs: (source.readingElapsedMs ?? 0) + (args.readingAction ? elapsed : 0),
    reviewElapsedMs: (source.reviewElapsedMs ?? 0) + (args.grade ? elapsed : 0),
    readTopicCount: (source.readTopicCount ?? 0) + (initial && args.readingAction ? 1 : 0),
    reviewedItemCount: (source.reviewedItemCount ?? 0) + (initial && args.grade ? 1 : 0),
    ...(args.grade ? { nextReviewDueAt: resolveEarliestReviewDueAt(source.nextReviewDueAt, snapshot.nodesById[current]?.review?.due) } : {}) };
  const preserveCurrent = args.readings?.length && !args.readingAction && !args.grade &&
    (!source.currentNodeId || await isCycleCurrentReady(db, session, mode, args.now, settings));
  if (!preserveCurrent && !applyPreparedNavigation(db, source, session, eligible, args.now)) {
    await chooseCycleCurrent(db, session, mode, args.now, settings);
  }
  cycle.change = changes.change();
  return session;
}

function applyPreparedNavigation(db: DailyFlowStore, source: DailyFlowSession, session: DailyFlowSession,
  eligible: Set<string>, now: string) {
  const prepared = db.preparedNavigation;
  const navigation = prepared?.valid() && prepared.source.currentNodeId === source.currentNodeId &&
    prepared.source.daily?.dayKey === source.daily?.dayKey &&
    prepared.source.candidateMembershipHash === source.candidateMembershipHash &&
    prepared.source.cycle?.scanAfter === source.cycle?.scanAfter &&
    prepared.source.cycle?.lapLimit === source.cycle?.lapLimit &&
    (prepared.next.currentNodeId || !eligible.has(source.currentNodeId!)) ? prepared.next : null;
  if (navigation?.cycle) {
    session.currentNodeId = navigation.currentNodeId;
    session.currentItemStartedAt = now;
    session.isAnswerRevealed = false;
    session.continueNodeId = null;
    session.cycle!.scanAfter = navigation.cycle.scanAfter;
    session.cycle!.lapLimit = navigation.cycle.lapLimit;
    session.cycle!.clearedAt = navigation.cycle.clearedAt;
    session.completedAt = navigation.currentNodeId ? null : session.cycle!.clearedAt;
    return true;
  }
  db.preparedNavigation = undefined;
  return false;
}
