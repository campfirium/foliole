import { hashTextBody } from '../database/textBodyHash.js';
import { hasDeletedAncestor } from '../review/queue/reviewQueuePlannerHelpers.js';
import type { ReviewSessionMode } from '../review/queue/reviewQueueTypes.js';
import type { SchedulerCard } from '../review/types.js';
import type { DbPort } from '../sync/dbPort.js';

import type { DailyFlowCommitArgs, DailyFlowOpenArgs, DailyFlowResult, DailyFlowSettings, DailyFlowSnapshot } from './dailyFlowContract.js';
import { afterDailyGrade, flowDay, flowPlan, fullDayCandidates, prepareFlowSession } from './dailyFlowPlanning.js';
import type { DailyFlowSession } from './dailyFlowSession.js';
import { readDailyFlow, writeDailyFlow } from './dailyFlowStorage.js';
import { resolveEarliestReviewDueAt } from './flowSessionProgress.js';

export interface DailyFlowPersistence {
  snapshot(db: DbPort): Promise<DailyFlowSnapshot>;
  grade(db: DbPort, args: NonNullable<DailyFlowCommitArgs['grade']>, opId: string): Promise<SchedulerCard | null>;
  reading(db: DbPort, value: NonNullable<DailyFlowCommitArgs['readings']>[number], now: string): Promise<void>;
  reviewHistory(db: DbPort, value: NonNullable<DailyFlowCommitArgs['reviewHistory']>, now: string): Promise<SchedulerCard | null>;
}

export function openDailyFlow(db: DbPort, args: DailyFlowOpenArgs, settings: DailyFlowSettings,
  persistence: DailyFlowPersistence): Promise<DailyFlowResult> {
  return db.transaction(async tx => {
    let stored = await readDailyFlow(tx);
    const dayKey = flowDay(args.now, settings);
    const settingsKey = JSON.stringify(settings);
    const sameDay = stored?.day_key === dayKey;
    if (sameDay && stored && !stored.invalidated && stored.settings_key === settingsKey &&
      stored.mode === args.mode && stored.session.currentNodeId && !args.refresh && !args.preferredNodeId) {
      return { session: stored.session };
    }
    const snapshot = await persistence.snapshot(tx);
    const candidates = sameDay && stored && !stored.invalidated && stored.settings_key === settingsKey
      ? undefined : fullDayCandidates(snapshot, args.now, settings);
    const seed = sameDay ? stored?.session : args.seed?.sessionStartedAt &&
      flowDay(args.seed.sessionStartedAt, settings) === dayKey ? args.seed : undefined;
    if (!sameDay) {
      await tx.run('DELETE FROM daily_flow_entries');
      await tx.run('DELETE FROM daily_flow_operations');
      stored = null;
    }
    const session = prepareFlowSession(snapshot, args, settings, seed);
    const saved = await writeDailyFlow(tx, { dayKey, mode: args.mode, settingsKey,
      now: args.now, revision: (stored?.revision ?? 0) + 1, session, ...(candidates ? { candidateIds: candidates } : {}) });
    return { session: saved, nodes: receiptNodes(snapshot, [saved.currentNodeId, args.seed?.currentNodeId]) };
  });
}

export function commitDailyFlow(db: DbPort, args: DailyFlowCommitArgs, settings: DailyFlowSettings,
  persistence: DailyFlowPersistence): Promise<DailyFlowResult> {
  return db.transaction(async tx => {
    const stored = await readDailyFlow(tx);
    if (args.token.scope !== (settings.scope ?? '')) throw new Error('daily_flow_library_changed');
    const hash = hashTextBody(JSON.stringify(args));
    const [previous] = await tx.query<{ input_hash: string; revision: number; card_json: string | null }>(
      'SELECT input_hash, revision, card_json FROM daily_flow_operations WHERE op_id = ?', [args.opId]);
    if (previous) {
      if (previous.input_hash !== hash) throw new Error('daily_flow_operation_mismatch');
      if (!stored || stored.invalidated || stored.revision !== previous.revision) throw new Error('daily_flow_ack_superseded');
      const replayedSnapshot = await persistence.snapshot(tx);
      return { nodes: receiptNodes(replayedSnapshot, [stored.session.currentNodeId, args.grade?.nodeId, ...(args.readings ?? []).map(value => value.nodeId)]), replayed: true, ...(replayedSnapshot ? { readings: (args.readings ?? []).map(value => ({ nodeId: value.nodeId, reading: replayedSnapshot.nodesById[value.nodeId]?.reading ?? null })) } : {}), session: stored.session, ...(previous.card_json === null ? {} : { card: JSON.parse(previous.card_json) as SchedulerCard | null }) };
    }
    if (!stored || stored.day_key !== args.token.dayKey || (stored.revision !== args.token.revision && !sameSession(stored.session, args.sourceSession)) ||
      stored.day_key !== flowDay(args.now, settings)) throw new Error('daily_flow_changed');
    const snapshot = await persistence.snapshot(tx);
    assertCurrentFacts(snapshot, args);
    const mode = stored.mode as ReviewSessionMode;
    const base = stored.invalidated ? prepareFlowSession(snapshot, { now: args.now, mode }, settings, stored.session) : stored.session;
    if (args.grade && (base.currentNodeId !== args.grade.nodeId ||
      !flowPlan(snapshot, 'review-first', args.now, settings).fsrsQueueNodeIds.includes(args.grade.nodeId))) {
      throw new Error('daily_flow_learning_changed');
    }
    const result = await persistLearning(tx, args, persistence);
    const updated = await persistence.snapshot(tx);
    let session = args.grade ? afterDailyGrade(updated, base, mode, args.now, settings) : args.nextSession;
    if (!session) throw new Error('daily_flow_session_missing');
    if (args.reviewHistory?.mode === 'redo') session = { ...session, nextReviewDueAt:
      resolveEarliestReviewDueAt(args.sourceSession?.nextReviewDueAt, result.card?.due) };
    if (stored.invalidated && !args.grade) session = prepareFlowSession(updated,
      { now: args.now, mode }, settings, session);
    const saved = await writeDailyFlow(tx, { dayKey: stored.day_key, mode, settingsKey: JSON.stringify(settings),
      now: args.now, revision: stored.revision + 1, session,
      ...(stored.invalidated ? { candidateIds: fullDayCandidates(updated, args.now, settings) } : {}) });
    await tx.run('INSERT INTO daily_flow_operations (op_id, input_hash, revision, card_json) VALUES (?, ?, ?, ?)',
      [args.opId, hash, saved.daily!.revision, result.card === undefined ? null : JSON.stringify(result.card)]);
    return { nodes: receiptNodes(updated, [saved.currentNodeId, args.grade?.nodeId, args.reviewHistory?.nodeId, ...(args.readings ?? []).map(value => value.nodeId)]), session: saved, ...result, ...(args.readings ? { readings: args.readings.map(value => ({ nodeId: value.nodeId, reading: updated.nodesById[value.nodeId]?.reading ?? null })) } : {}) };
  });
}

function sameProfile(left: unknown, right: unknown) {
  if (left == null || right == null) return left == null && right == null;
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => a[key] === b[key]);
}

function assertCurrentFacts(snapshot: DailyFlowSnapshot, args: DailyFlowCommitArgs) {
  const changes = args.grade ? [{ nodeId: args.grade.nodeId, before: args.grade.before, field: 'review' as const }]
    : args.reviewHistory ? [{ nodeId: args.reviewHistory.nodeId, before: args.reviewHistory.before, field: 'review' as const }]
    : (args.readings ?? []).map(value => ({ ...value, field: 'reading' as const }));
  for (const value of changes) {
    const node = snapshot.nodesById[value.nodeId];
    if (!node || snapshot.trashedNodeIds.includes(value.nodeId) || hasDeletedAncestor(node, snapshot.nodesById) || !sameProfile(node[value.field], value.before)) {
      throw new Error('daily_flow_learning_changed');
    }
  }
}

async function persistLearning(db: DbPort, args: DailyFlowCommitArgs,
  persistence: DailyFlowPersistence): Promise<{ card?: SchedulerCard | null }> {
  if (args.grade) return { card: await persistence.grade(db, args.grade, args.opId) };
  if (args.reviewHistory) return { card: await persistence.reviewHistory(db, args.reviewHistory, args.now) };
  for (const value of args.readings ?? []) {
    if (!sameProfile(value.before, value.after)) await persistence.reading(db, value, args.now);
  }
  return {};
}

export function withoutDailyToken(session: DailyFlowSession): DailyFlowSession {
  const result = { ...session };
  delete result.daily;
  return result;
}

function sameSession(left: DailyFlowSession, right: DailyFlowSession | undefined) {
  if (!right) return false;
  const normalize = (session: DailyFlowSession) => Object.entries({ ...session, soonNodeIds: session.soonNodeIds ?? [] })
    .filter(([key, value]) => key !== 'daily' && key !== 'isAnswerRevealed' && value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function receiptNodes(snapshot: DailyFlowSnapshot, ids: (string | null | undefined)[]) {
  return Object.fromEntries([...new Set(ids)].filter((id): id is string => Boolean(id && snapshot.nodesById[id]))
    .map(id => [id, snapshot.nodesById[id]!]));
}
