import { buildReviewQueuePlan, createReviewQueuePlanner, type ReviewQueuePlan, type ReviewQueuePlanInput } from '../review/queue/reviewQueuePlanner.js';
import type { ReviewSessionMode } from '../review/queue/reviewQueueTypes.js';
import { resolveCurrentDayStart } from '../review/reviewDayBoundary.js';

import type { DailyFlowSettings, DailyFlowLearningSnapshot, DailyFlowOpenArgs } from './dailyFlowContract.js';
import type { DailyFlowSession } from './dailyFlowSession.js';
import { buildReviewSessionAfterGrade } from './flowGradeSession.js';
import { calculateReviewStepElapsedMs } from './flowSessionProgress.js';
import { advanceReviewSession } from './flowSessionState.js';

type FlowPlanningSnapshot = Pick<ReviewQueuePlanInput, 'nodeOrder' | 'nodesById' | 'trashedNodeIds' | 'nodePriorities'>;

export function flowDay(now: string, settings: DailyFlowSettings) {
  return resolveCurrentDayStart(new Date(now), settings.newDayStartsAtHour).toISOString();
}

export function flowPlan(snapshot: FlowPlanningSnapshot, mode: ReviewSessionMode, now: string,
  settings: DailyFlowSettings, includeScheduled = false, candidateNow = now) {
  return buildReviewQueuePlan({ ...snapshot, mode, now, candidateNow, includeScheduled,
    newDayStartsAtHour: settings.newDayStartsAtHour, readingDayStartsAtHour: settings.newDayStartsAtHour,
    pushQueueRules: settings.pushQueue });
}

export function fullDayCandidates(snapshot: DailyFlowLearningSnapshot, now: string, settings: DailyFlowSettings) {
  const plan = flowPlan(snapshot, 'recommended', now, settings, false, flowDayEnd(now, settings));
  return planCandidateIds(plan);
}

function flowDayEnd(now: string, settings: DailyFlowSettings) {
  const end = new Date(flowDay(now, settings));
  end.setDate(end.getDate() + 1);
  return new Date(end.getTime() - 1).toISOString();
}

function planCandidateIds(plan: ReviewQueuePlan) {
  return [...new Set([...plan.queueNodeIds, ...plan.fsrsQueueNodeIds, ...plan.readingQueueNodeIds])];
}

export function prepareDailyFlowPlans(snapshot: FlowPlanningSnapshot, args: DailyFlowOpenArgs, settings: DailyFlowSettings) {
  const plan = createReviewQueuePlanner({ ...snapshot, mode: args.mode, now: args.now,
    newDayStartsAtHour: settings.newDayStartsAtHour, readingDayStartsAtHour: settings.newDayStartsAtHour,
    pushQueueRules: settings.pushQueue });
  const initial = plan();
  const fullDay = plan({ mode: 'recommended', candidateNow: flowDayEnd(args.now, settings) });
  return { initial, fullDayNodeIds: planCandidateIds(fullDay) };
}

export function prepareFlowSession(snapshot: FlowPlanningSnapshot, args: DailyFlowOpenArgs,
  settings: DailyFlowSettings, seed?: DailyFlowSession,
  planned = flowPlan(snapshot, args.mode, args.now, settings)): DailyFlowSession {
  const allowed = args.mode === 'review-first' ? planned.fsrsQueueNodeIds : args.mode === 'reading-only' ? planned.readingQueueNodeIds : [...planned.fsrsQueueNodeIds, ...planned.readingQueueNodeIds];
  const tasks = args.mode === 'review-first' ? planned.fsrsQueueNodeIds : args.mode === 'reading-only' ? planned.readingQueueNodeIds : planned.queueNodeIds;
  const ready = new Set(allowed);
  const { soon, hiddenSoon } = resolveFlowSoon(seed, planned, ready);
  const continuation = seed?.currentNodeId && !seed.queueNodeIds.includes(seed.currentNodeId)
    && ready.has(seed.currentNodeId) ? seed.currentNodeId : null;
  const deferReading = soon.length > 0 || Boolean(continuation);
  const queue = [...new Set([...(seed?.queueNodeIds ?? []).filter(id => ready.has(id) && !soon.includes(id)),
    ...tasks.filter(id => !soon.includes(id) && id !== continuation &&
      (!deferReading || planned.fsrsQueueNodeIds.includes(id)))])];
  if (!queue.length && args.mode === 'recommended' && !soon.length && !continuation) queue.push(...planned.readingQueueNodeIds);
  const preferred = args.preferredNodeId ?? seed?.currentNodeId;
  const current = preferred && (queue.includes(preferred) || soon.includes(preferred) || preferred === continuation) ? preferred : queue[0] ?? soon.shift() ?? null;
  if (current && queue.includes(current)) queue.splice(0, queue.length, current, ...queue.filter(id => id !== current));
  const startedAt = !args.prepareOnly && current ? args.now : null;
  const prior = seed ?? { currentNodeId: null, queueNodeIds: [], isAnswerRevealed: false, totalNodeCount: 0,
    sessionStartedAt: startedAt, currentItemStartedAt: startedAt,
    readingElapsedMs: 0, readTopicCount: 0, reviewElapsedMs: 0, reviewedItemCount: 0 };
  return { ...prior, currentNodeId: current, queueNodeIds: queue, soonNodeIds: soon.filter(id => id !== current),
    ...(hiddenSoon.length || seed?.hiddenSoonNodeIds ? { hiddenSoonNodeIds: hiddenSoon } : {}),
    isAnswerRevealed: false, totalNodeCount: Math.max(prior.totalNodeCount, (prior.readTopicCount ?? 0) + (prior.reviewedItemCount ?? 0) + queue.length),
    ...(current ? { completedAt: null } : {}) };
}

// Mode availability only partitions pending Soon; actual eligibility retires it.
function resolveFlowSoon(seed: DailyFlowSession | undefined,
  planned: ReturnType<typeof flowPlan>, ready: Set<string>) {
  const eligible = new Set([...planned.fsrsQueueNodeIds, ...planned.readingQueueNodeIds]);
  const hiddenCurrent = seed?.currentNodeId && !seed.queueNodeIds.includes(seed.currentNodeId)
    && !ready.has(seed.currentNodeId) ? [seed.currentNodeId] : [];
  const pending = [...new Set([...hiddenCurrent, ...(seed?.hiddenSoonNodeIds ?? []),
    ...(seed?.soonNodeIds ?? [])])].filter(id => eligible.has(id));
  return { soon: pending.filter(id => ready.has(id)), hiddenSoon: pending.filter(id => !ready.has(id)) };
}

export function afterDailyGrade(snapshot: DailyFlowLearningSnapshot, session: DailyFlowSession,
  mode: ReviewSessionMode, now: string, settings: DailyFlowSettings): DailyFlowSession {
  const plan = flowPlan(snapshot, mode, now, settings);
  const planned = mode === 'review-first' ? plan.fsrsQueueNodeIds : mode === 'reading-only' ? plan.readingQueueNodeIds : plan.queueNodeIds;
  const soon = session.soonNodeIds ?? [];
  const eligible = new Set(mode === 'review-first' ? plan.fsrsQueueNodeIds : mode === 'reading-only'
    ? plan.readingQueueNodeIds : [...plan.fsrsQueueNodeIds, ...plan.readingQueueNodeIds]);
  const retained = session.queueNodeIds.filter(id => eligible.has(id));
  const task = [...retained, ...planned.filter(id => !retained.includes(id) && !soon.includes(id) && (!soon.length ||
    session.queueNodeIds.includes(id) || plan.fsrsQueueNodeIds.includes(id)))];
  if (!task.length && soon.length) return advanceReviewSession(session, { handledAt: now,
    nextNodeId: soon[0]!, queueNodeIds: [], soonNodeIds: soon.slice(1),
    nextReviewDueAt: snapshot.nodesById[session.currentNodeId ?? '']?.review?.due ?? null,
    reviewElapsedMsDelta: calculateReviewStepElapsedMs(session, now), reviewedItemDelta: 1 });
  const remaining = new Set(task);
  const extension = [...new Set([...plan.fsrsQueueNodeIds, ...plan.readingQueueNodeIds])].find(id => !remaining.has(id)) ?? null;
  return buildReviewSessionAfterGrade({ continueNodeId: extension,
    nextDueAt: snapshot.nodesById[session.currentNodeId ?? '']?.review?.due ?? null,
    nextNodeId: task[0] ?? null, now, queueNodeIds: task,
    reviewElapsedMsDelta: calculateReviewStepElapsedMs(session, now), reviewSession: session,
    reviewedItemDelta: remaining.has(session.currentNodeId ?? '') ? 0 : 1 });
}
