import type { ReviewQueueNode } from '../review/queue/reviewQueuePlanner.js';

import { cycleScanFilter } from './cycleFlowReadiness.js';
import { cycleReadyNodeIds, cycleWindow, selectCycleSuccessor } from './cycleFlowSelection.js';
import type { CycleStoredRow } from './cycleFlowTypes.js';
import type { DailyFlowLearningSnapshot, DailyFlowOpenArgs, DailyFlowSettings } from './dailyFlowContract.js';
import type { DailyFlowSession, DiveFlowCursor } from './dailyFlowSession.js';
import type { DailyFlowStore } from './dailyFlowStore.js';
import { findNextDiveUnread, isUnreadDiveTopic } from './diveUnreadTopics.js';

function belongsToDive(id: string, topics: ReadonlySet<string>, nodes: Record<string, ReviewQueueNode>) {
  const seen = new Set<string>();
  let node = nodes[id];
  while (node && !seen.has(node.id)) {
    if (topics.has(node.id)) return true;
    seen.add(node.id);
    node = node.parentNodeId ? nodes[node.parentNodeId] : undefined;
  }
  return false;
}

export function matchesDivePhase(dive: Pick<DiveFlowCursor, 'phase'>, row: { node_id: string; initial_task: number }, snapshot: DailyFlowLearningSnapshot) {
  return (dive.phase !== 'initial' || Boolean(row.initial_task)) &&
    (dive.phase !== 'topics' || snapshot.nodesById[row.node_id]?.kind === 'topic');
}

export async function isDiveCurrentReady(db: DailyFlowStore, source: DailyFlowSession, snapshot: DailyFlowLearningSnapshot,
  now: string, settings: DailyFlowSettings) {
  const dive = source.dive!;
  const id = source.currentNodeId;
  if (!id || dive.stop) return false;
  if (dive.phase === 'topics') {
    return dive.memberIds?.[dive.position - 1] === id && isUnreadDiveTopic(id, snapshot);
  }
  const [row] = await db.readRows([id]);
  // The displayed scope admits the current card. The committed scope is read for its successor.
  const admitted = dive.memberIds ? dive.memberIds.includes(id) : belongsToDive(id, new Set(dive.topicIds), snapshot.nodesById);
  // A due entry may sit past the segment's end and no longer be one of the first segment's tasks.
  const timed = dive.timedResume?.key === dive.position;
  return Boolean(admitted && row?.active && row.order_key === dive.position &&
    (timed || (row.order_key <= dive.limit && matchesDivePhase(dive, row, snapshot))) &&
    cycleReadyNodeIds(snapshot, dive.mode, now, settings).includes(id));
}

export async function assertDiveCurrent(db: DailyFlowStore, source: DailyFlowSession, snapshot: DailyFlowLearningSnapshot,
  now: string, settings: DailyFlowSettings) {
  if (!await isDiveCurrentReady(db, source, snapshot, now, settings)) throw new Error('daily_flow_learning_changed');
}

export async function openDiveCurrent(db: DailyFlowStore, global: DailyFlowSession, args: DailyFlowOpenArgs,
  settings: DailyFlowSettings) {
  const scope = args.dive!;
  const seed = args.seed;
  const previous = seed?.daily?.dayKey === global.daily?.dayKey && seed?.daily?.scope === global.daily?.scope &&
    seed?.dive?.id === scope.id && seed.dive.mode === args.mode ? seed.dive : undefined;
  const phase = previous?.stop && args.diveStep === 'continue'
    ? previous.phase === 'initial' ? 'today' : 'topics'
    : previous?.phase ?? 'initial';
  if (previous && !args.diveStep && previous.stop) return displayDiveSession(global, previous, null, null);
  if (previous && !args.diveStep && seed?.currentNodeId &&
    await isDiveCurrentReady(db, seed, await db.scopedLearningSnapshot([seed.currentNodeId]), args.now, settings)) {
    return { ...displayDiveSession(global, previous, seed.currentNodeId, seed.currentItemStartedAt ?? null),
      isAnswerRevealed: seed.isAnswerRevealed };
  }
  const restart = !previous || (previous.stop && args.diveStep);
  const dive: DiveFlowCursor = restart
    ? { ...scope, mode: args.mode, phase, position: 0, stop: null,
      hasWork: previous?.phase === 'topics' && previous.stop === 'finished',
      limit: phase === 'initial' ? global.cycle!.clearKey
        : args.diveStep === 'retry' && previous ? previous.limit : global.cycle!.tailKey }
    : rewindDiveCurrent(previous, seed?.currentNodeId);
  return selectDiveCurrent(db, global, dive, args.now, settings);
}

export function rewindDiveCurrent(dive: DiveFlowCursor, nodeId?: string | null): DiveFlowCursor {
  if (!nodeId) return dive;
  const { timedResume, ...rest } = dive;
  if (rest.resumeAfter !== undefined) return { ...rest, revisitIds: [nodeId, ...(rest.revisitIds ?? [])] };
  return { ...rest, position: timedResume?.key === rest.position ? timedResume.after : Math.max(0, rest.position - 1) };
}

export async function selectDiveCurrent(db: DailyFlowStore, global: DailyFlowSession, dive: DiveFlowCursor,
  now: string, settings: DailyFlowSettings, excluded?: string) {
  if (dive.stop) return displayDiveSession(global, dive, null, null);
  if (!db.readDiveMembers) throw new Error('daily_flow_dive_unavailable');
  const memberIds = await db.readDiveMembers(dive.id);
  if (dive.phase === 'topics') {
    const { order, current } = await findNextDiveUnread(db, memberIds, dive.memberIds ?? [], dive.position);
    return displayDiveSession(global, {
      ...dive, memberIds: order, position: current ? order.indexOf(current) + 1 : order.length,
      limit: order.length, hasWork: dive.hasWork || Boolean(current),
      stop: current ? null : dive.hasWork ? 'finished' : 'empty'
    }, current, current ? now : null);
  }
  const members = new Set(memberIds);
  // A due or newly admitted entry is taken out of order and leaves this position unchanged.
  const cursor = dive.resumeAfter ??
    (dive.timedResume?.key === dive.position ? dive.timedResume.after : dive.position);
  const revisit = cursor ? earlierMemberIds(dive, members) : [];
  const healed = new Map<string, CycleStoredRow>();
  const orderedIds = await orderedMemberIds(db, dive, memberIds);
  const args = { mode: dive.mode, now, settings, nodeIds: memberIds, orderedIds, bounded: true, ...(excluded ? { excluded } : {}),
    onReadiness: (rows: CycleStoredRow[]) => rows.forEach(row => healed.set(row.node_id, row)) };
  // The Dive moves its own position over the shared daily list; the global position is never saved from it.
  const meta = { ...global.cycle!, scanAfter: cursor, lapLimit: dive.limit };
  delete meta.timedResume;
  let earlier = null as Awaited<ReturnType<typeof selectEarlierMember>>;
  const row = members.size ? await selectCycleSuccessor(db, meta, { ...args, beforeOrdered: async () => {
    const ordered = new Set(orderedIds);
    earlier = await selectEarlierMember(db, revisit.filter(id => ordered.has(id)), cursor, args);
    return earlier?.row ?? null;
  } }) : null;
  if (healed.size) await db.writeRows([...healed.values()]);
  const dayEnd = global.dayWindow && new Date(Date.parse(global.dayWindow.end) - 1).toISOString();
  const stillWaiting = !row && dive.phase !== 'initial' && dayEnd &&
    await hasWaitingMember(db, memberIds, args, dayEnd);
  const stop = row ? null : stillWaiting ? 'waiting' : dive.hasWork ? 'finished' : 'empty';
  const next: DiveFlowCursor = { ...dive, memberIds, position: row?.order_key ?? dive.limit,
    hasWork: dive.hasWork || Boolean(row), stop };
  delete next.waitingIds;
  delete next.resumeAfter;
  delete next.revisitIds;
  delete next.timedResume;
  if (meta.timedResume) next.timedResume = meta.timedResume;
  const remaining = meta.timedResume ? revisit.filter(id => id !== row!.node_id) : earlier?.remaining;
  if (remaining && (earlier || remaining.length)) {
    next.resumeAfter = cursor;
    next.revisitIds = remaining;
  }
  return displayDiveSession(global, next, row?.node_id ?? null, row ? now : null);
}

// The first segment orders only initial tasks, so other members never need their learning facts.
async function orderedMemberIds(db: DailyFlowStore, dive: DiveFlowCursor, memberIds: string[]) {
  if (dive.phase !== 'initial' || !memberIds.length) return memberIds;
  return (await db.readRows(memberIds)).filter(row => row.active && row.initial_task).map(row => row.node_id);
}

function earlierMemberIds(dive: DiveFlowCursor, members: ReadonlySet<string>) {
  const previous = new Set(dive.memberIds);
  const revisit = new Set(dive.revisitIds?.filter(id => members.has(id)));
  for (const id of members) {
    if (!previous.has(id)) revisit.add(id);
  }
  return [...revisit];
}

type DiveSelection = { mode: DiveFlowCursor['mode']; now: string; settings: DailyFlowSettings };

async function selectEarlierMember(db: DailyFlowStore, ids: string[], through: number, args: DiveSelection) {
  // Only newly admitted members can use positions this round has already passed.
  const rows = (await db.readRows(ids)).filter(row => row.active && row.order_key <= through)
    .sort((a, b) => a.order_key - b.order_key);
  if (!rows.length) return null;
  const nodeOrder = rows.map(row => row.node_id);
  const snapshot = await db.scopedLearningSnapshot(nodeOrder);
  const ready = new Set(cycleReadyNodeIds({ ...snapshot, nodeOrder }, args.mode, args.now, args.settings));
  const index = rows.findIndex(row => ready.has(row.node_id));
  return index < 0 ? null : { row: rows[index]!, remaining: nodeOrder.slice(index + 1) };
}

const WAITING_BATCH_SIZE = 32;

// Members that become due later today are reported wherever they now sit in the daily list.
async function hasWaitingMember(db: DailyFlowStore, memberIds: string[], args: DiveSelection, dayEnd: string) {
  if (!db.timedRows || !memberIds.length) return false;
  const rows = await db.timedRows(cycleScanFilter(args.mode, dayEnd), WAITING_BATCH_SIZE, memberIds);
  const nodeOrder = rows.map(row => row.node_id);
  if (!nodeOrder.length) return false;
  const snapshot = { ...await db.scopedLearningSnapshot(nodeOrder), nodeOrder };
  const ready = new Set(cycleReadyNodeIds(snapshot, args.mode, args.now, args.settings));
  return cycleReadyNodeIds(snapshot, args.mode, dayEnd, args.settings).some(id => !ready.has(id));
}

export function displayDiveSession(global: DailyFlowSession, dive: DiveFlowCursor, currentNodeId: string | null,
  currentItemStartedAt: string | null) {
  return cycleWindow({ ...global, dive, currentNodeId, currentItemStartedAt,
    isAnswerRevealed: false, completedAt: null, continueNodeId: null });
}
