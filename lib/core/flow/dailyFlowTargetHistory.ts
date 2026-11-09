import { hashTextBody } from '../database/textBodyHash.js';
import { hasDeletedAncestor } from '../review/queue/reviewQueuePlannerHelpers.js';
import type { DbPort } from '../sync/dbPort.js';

import { replayCycleHistory } from './cycleFlowHistory.js';
import { sameLearningProfile } from './cycleFlowLearning.js';
import { openCycleFlow, reconcileCycle } from './cycleFlowOpen.js';
import { dailyFlowCommitSchema, type DailyFlowCommitArgs, type DailyFlowSettings, type DailyFlowResult } from './dailyFlowContract.js';
import { readDailyFlowFact } from './dailyFlowFactStorage.js';
import { applyLocalDailyFlowOperations, readLocalDailyFlowFacts } from './dailyFlowLocalApplication.js';
import type { DailyFlowPersistence } from './dailyFlowService.js';
import { createSqliteDailyFlowStore } from './dailyFlowSqliteStore.js';
import { readDailyFlow, saveCycleFlow } from './dailyFlowStorage.js';
import type { DailyFlowSyncFact } from './dailyFlowSyncFact.js';
import { effectiveFlowActions } from './dailyFlowSyncMerge.js';
import { recordDailyFlowSync } from './dailyFlowSyncRecord.js';
import { rewindDiveCurrent, selectDiveCurrent } from './diveCycleFlow.js';

async function persistTargetLearning(db: DbPort, args: DailyFlowCommitArgs, facts: DailyFlowSyncFact[],
  target: DailyFlowSyncFact, persistence: DailyFlowPersistence) {
  const ids = args.reviewHistory ? [args.reviewHistory.nodeId] : (args.readings ?? []).map(value => value.nodeId);
  const snapshot = await persistence.learningSnapshot(db, ids);
  for (const id of ids) {
    const node = snapshot.nodesById[id];
    if (!node || snapshot.trashedNodeIds.includes(id) || hasDeletedAncestor(node, snapshot.nodesById)) {
      throw new Error('daily_flow_learning_changed');
    }
  }
  if (args.reviewHistory) {
    const allowed = [target.id, ...facts.filter(fact => fact.kind === 'redo' && fact.targetOpId === target.id)
      .map(fact => fact.reviewOpId).filter(Boolean)];
    if (target.action && target.action !== 'grade' || !allowed.includes(args.reviewHistory.targetOpId)) throw new Error('flow_history_changed');
    return { card: await persistence.reviewHistory(db, args.reviewHistory, args.now) };
  }
  const contributions = effectiveFlowActions(facts);
  for (const value of target.readings ?? args.readings ?? []) {
    if (!snapshot.nodesById[value.nodeId]) throw new Error('flow_history_changed');
    if (sameLearningProfile(value.before, value.after)) continue;
    const current = snapshot.nodesById[value.nodeId]!.reading;
    const actions = contributions.filter(fact => fact.readings?.some(reading => reading.nodeId === value.nodeId &&
      !sameLearningProfile(reading.before, reading.after)));
    const latest = actions.at(-1);
    const isTarget = latest && (latest.id === target.id || latest.targetOpId === target.id);
    const expected = latest?.readings!.find(reading => reading.nodeId === value.nodeId)!.after ?? value.before;
    if (!sameLearningProfile(current, expected) || (args.historyMode === 'undo' && latest && !isTarget)) continue;
    const others = actions.filter(fact => fact.id !== target.id && fact.targetOpId !== target.id);
    const after = args.historyMode === 'undo'
      ? others.at(-1)?.readings!.find(reading => reading.nodeId === value.nodeId)!.after ?? value.before : value.after;
    if (!sameLearningProfile(current, after)) await persistence.reading(db, { ...value, before: current ?? null, after }, args.now);
  }
  return {};
}

export async function commitTargetedFlowHistory(db: DbPort, args: DailyFlowCommitArgs,
  settings: DailyFlowSettings, persistence: DailyFlowPersistence): Promise<DailyFlowResult | null> {
  if (!args.historyTargetOpId || !args.historyMode) return null;
  dailyFlowCommitSchema.parse(args);
  const target = await readDailyFlowFact(db, args.historyTargetOpId);
  if (!target) return null; // Pre-synchronization history retains its existing strict replay contract.
  const stored = await readDailyFlow(db);
  if (args.token.scope !== (settings.scope ?? '')) throw new Error('daily_flow_library_changed');
  if (!stored || stored.day_key !== args.token.dayKey || target.kind !== 'advance' ||
    target.settings.dayWindow.end <= stored.day_key) throw new Error('flow_history_changed');
  const nodeId = args.reviewHistory?.nodeId ?? args.readings?.[0]?.nodeId;
  if (!nodeId || (target.nodeId ? target.nodeId !== nodeId : !target.rows.some(value => value.node_id === nodeId))) {
    throw new Error('flow_history_changed');
  }
  const diveAction = args.historySourceSession?.dive && args.nextSession?.dive;
  const store = createSqliteDailyFlowStore(db, persistence);
  const hash = hashTextBody(JSON.stringify(args));
  const previous = await store.readOperation(args.opId);
  if (previous) {
    if (previous.input_hash !== hash) throw new Error('daily_flow_operation_mismatch');
    if (stored.invalidated || previous.revision !== stored.revision) throw new Error('daily_flow_ack_superseded');
    return historyReceipt(db, persistence, args, { session: await historyDisplay(store, args, stored.session, settings), replayed: true,
      ...(previous.card_json === null ? {} : { card: JSON.parse(previous.card_json) }) });
  }
  const facts = await readLocalDailyFlowFacts(db, stored.session.dayWindow!.start, stored.session.dayWindow!.end);
  if (!facts.some(fact => fact.id === target.id)) throw new Error('flow_history_changed');
  const changed = await persistTargetLearning(db, args, facts, target, persistence);
  const orderChange = target.session.cycle?.change;
  const reordered = orderChange?.before.some(before => before.node_id === nodeId &&
    target.rows.some(after => after.node_id !== nodeId && after.order_key === before.order_key));
  const restored = reordered ? await replayCycleHistory(store, stored.session, args) : null;
  const desired = restored ?? (diveAction ? { ...stored.session } : { ...stored.session, currentNodeId: args.historyMode === 'undo' ? nodeId : target.session.currentNodeId, isAnswerRevealed: false });
  delete desired.rebuildSourceRevision;
  await saveCycleFlow(db, { dayKey: stored.day_key, mode: stored.mode, settingsKey: stored.settings_key,
    now: args.now, revision: stored.revision + 1, session: desired });
  await recordDailyFlowSync(db, { session: desired, sourceSession: stored.session }, settings, args.now, args);
  await applyLocalDailyFlowOperations(db, args.now, undefined, restored ? new Set([nodeId]) : undefined);
  const historyNow = new Date(Math.min(Date.parse(args.now), Date.parse(settings.dayWindow!.end) - 1)).toISOString();
  const result = diveAction && args.sourceSession?.dive
    ? await reconcileDiveHistory(db, args, historyNow, settings, persistence)
    : await openCycleFlow(db, { now: historyNow, mode: stored.mode as NonNullable<DailyFlowResult['mode']>,
      ...(diveAction ? { returnFromDive: true } : {}) }, settings, persistence);
  await store.saveOperation(args.opId, { input_hash: hash, revision: result.session.daily!.revision,
    card_json: changed.card === undefined ? null : JSON.stringify(changed.card), source_session_json: JSON.stringify(stored.session) });
  return historyReceipt(db, persistence, args, { ...result, ...changed, sourceSession: stored.session });
}

async function historyReceipt(db: DbPort, persistence: DailyFlowPersistence, args: DailyFlowCommitArgs, result: DailyFlowResult) {
  const ids = [...new Set([args.reviewHistory?.nodeId, result.session.currentNodeId, ...(args.readings ?? []).map(value => value.nodeId)]
    .filter((value): value is string => Boolean(value)))];
  const learning = await persistence.learningSnapshot(db, ids);
  return { ...result, learning: Object.fromEntries(ids.flatMap(id => {
    const node = learning.nodesById[id];
    return node ? [[id, { reading: node.reading ?? null, review: node.review ?? null }]] : [];
  })), mutationTimestamp: args.now,
    ...(args.readings ? { readings: args.readings.map(value => ({ nodeId: value.nodeId,
      reading: learning.nodesById[value.nodeId]?.reading ?? null })) } : {}) };
}

async function reconcileDiveHistory(db: DbPort, args: DailyFlowCommitArgs, now: string,
  settings: DailyFlowSettings, persistence: DailyFlowPersistence) {
  const store = createSqliteDailyFlowStore(db, persistence);
  const stored = (await store.readState())!;
  const reconciled = await reconcileCycle(store, stored, now, settings);
  const global = await store.saveState({ dayKey: stored.day_key, mode: stored.mode, settingsKey: JSON.stringify(settings),
    now, revision: stored.revision, session: reconciled });
  return { session: await historyDisplay(store, args, global, settings, now) };
}

async function historyDisplay(store: ReturnType<typeof createSqliteDailyFlowStore>, args: DailyFlowCommitArgs,
  global: import('./dailyFlowSession.js').DailyFlowSession, settings: DailyFlowSettings, now = args.now) {
  const current = args.sourceSession?.dive;
  const prior = args.historyMode === 'undo' ? args.nextSession : args.historySourceSession;
  const before = prior?.dive;
  if (!current) return global;
  if (!before || current.id !== before.id || current.phase !== before.phase || current.limit !== before.limit) {
    return selectDiveCurrent(store, global, rewindDiveCurrent(current, args.sourceSession?.currentNodeId), now, settings);
  }
  const cursor = args.historyMode === 'undo' ? rewindDiveCurrent(before, prior?.currentNodeId) : before;
  return selectDiveCurrent(store, global, { ...cursor, stop: null }, now, settings);
}
