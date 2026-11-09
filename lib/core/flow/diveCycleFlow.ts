import type { ReviewQueueNode } from '../review/queue/reviewQueuePlanner.js';

import { cycleReadyNodeIds, cycleWindow, scanCycleRange } from './cycleFlowSelection.js';
import type { CycleRow } from './cycleFlowTypes.js';
import type { DailyFlowLearningSnapshot, DailyFlowOpenArgs, DailyFlowSettings } from './dailyFlowContract.js';
import type { DailyFlowSession, DiveFlowCursor } from './dailyFlowSession.js';
import type { DailyFlowStore } from './dailyFlowStore.js';

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

function matchesPhase(dive: DiveFlowCursor, row: { node_id: string; initial_task: number }, snapshot: DailyFlowLearningSnapshot) {
  return (dive.phase !== 'initial' || Boolean(row.initial_task)) &&
    (dive.phase !== 'topics' || snapshot.nodesById[row.node_id]?.kind === 'topic');
}

const selectionMode = (dive: DiveFlowCursor) => dive.phase === 'topics' ? 'reading-only' : dive.mode;

async function isDiveCurrentReady(db: DailyFlowStore, source: DailyFlowSession, snapshot: DailyFlowLearningSnapshot,
  now: string, settings: DailyFlowSettings) {
  const dive = source.dive!;
  const id = source.currentNodeId;
  if (!id || dive.stop) return false;
  const [row] = await db.readRows([id]);
  // The displayed scope admits the current card. The committed scope is read for its successor.
  const admitted = dive.memberIds ? dive.memberIds.includes(id) : belongsToDive(id, new Set(dive.topicIds), snapshot.nodesById);
  return Boolean(admitted && row?.active && row.order_key === dive.position && row.order_key <= dive.limit &&
    matchesPhase(dive, row, snapshot) &&
    cycleReadyNodeIds(snapshot, selectionMode(dive), now, settings).includes(id));
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
    ? { ...scope, mode: args.mode, phase, position: 0, hasWork: false, stop: null,
      limit: phase === 'initial' ? global.cycle!.clearKey
        : args.diveStep === 'retry' && previous ? previous.limit : global.cycle!.tailKey }
    : rewindDiveCurrent(previous, seed?.currentNodeId);
  return selectDiveCurrent(db, global, dive, args.now, settings);
}

export function rewindDiveCurrent(dive: DiveFlowCursor, nodeId?: string | null): DiveFlowCursor {
  if (!nodeId) return dive;
  if (dive.resumeAfter === undefined) return { ...dive, position: Math.max(0, dive.position - 1) };
  return { ...dive, revisitIds: [nodeId, ...(dive.revisitIds ?? [])] };
}

export async function selectDiveCurrent(db: DailyFlowStore, global: DailyFlowSession, dive: DiveFlowCursor,
  now: string, settings: DailyFlowSettings) {
  if (dive.stop) return displayDiveSession(global, dive, null, null);
  if (!db.readDiveMembers) throw new Error('daily_flow_dive_unavailable');
  const memberIds = await db.readDiveMembers(dive.id);
  const members = new Set(memberIds);
  const resumeAfter = dive.resumeAfter ?? dive.position;
  const revisit = resumeAfter ? earlierMemberIds(dive, members) : [];
  const waiting = new Set(dive.waitingIds?.filter(id => members.has(id)));
  const matches = (row: CycleRow, snapshot: DailyFlowLearningSnapshot) =>
    members.has(row.node_id) && matchesPhase(dive, row, snapshot);
  const mode = selectionMode(dive);
  const dayEnd = global.dayWindow && new Date(Date.parse(global.dayWindow.end) - 1).toISOString();
  const onSkipped = (row: CycleRow, snapshot: DailyFlowLearningSnapshot) => {
    if (dayEnd && dive.phase !== 'initial' && matches(row, snapshot)) waiting.add(row.node_id);
  };
  const args = { mode, now, settings, matches, onSkipped };
  const earlier = resumeAfter && revisit.length ? await selectEarlierMember(db, revisit, resumeAfter, args) : null;
  const cycle = { ...global.cycle!, scanAfter: resumeAfter, lapLimit: dive.limit };
  const row = earlier?.row ?? (members.size ? await scanCycleRange(db, cycle, args) : null);
  if (row) waiting.delete(row.node_id);
  const stillWaiting = !row && dayEnd && await hasWaitingMember(db, [...waiting], args, dayEnd);
  const stop = row ? null : stillWaiting ? 'waiting' : dive.hasWork ? 'finished' : 'empty';
  const next: DiveFlowCursor = { ...dive, memberIds, position: row?.order_key ?? dive.limit, waitingIds: [...waiting],
    hasWork: dive.hasWork || Boolean(row), stop };
  if (earlier) {
    next.resumeAfter = resumeAfter;
    next.revisitIds = earlier.remaining;
  } else {
    delete next.resumeAfter;
    delete next.revisitIds;
  }
  return displayDiveSession(global, next, row?.node_id ?? null, row ? now : null);
}

function earlierMemberIds(dive: DiveFlowCursor, members: ReadonlySet<string>) {
  const previous = new Set(dive.memberIds);
  const revisit = new Set(dive.revisitIds?.filter(id => members.has(id)));
  for (const id of members) {
    if (!previous.has(id)) revisit.add(id);
  }
  return [...revisit];
}

type DiveSelection = Parameters<typeof scanCycleRange>[2];

async function selectEarlierMember(db: DailyFlowStore, ids: string[], through: number, args: DiveSelection) {
  // Only newly admitted members can use positions this round has already passed.
  const rows = (await db.readRows(ids)).filter(row => row.active && row.order_key <= through)
    .sort((a, b) => a.order_key - b.order_key);
  if (!rows.length) return null;
  const nodeOrder = rows.map(row => row.node_id);
  const snapshot = await db.scopedLearningSnapshot(nodeOrder);
  const ready = new Set(cycleReadyNodeIds({ ...snapshot, nodeOrder }, args.mode, args.now, args.settings));
  for (const [index, row] of rows.entries()) {
    if (ready.has(row.node_id) && args.matches!(row, snapshot)) {
      return { row, remaining: nodeOrder.slice(index + 1) };
    }
    if (!ready.has(row.node_id)) args.onSkipped?.(row, snapshot);
  }
  return null;
}

async function hasWaitingMember(db: DailyFlowStore, ids: string[], args: DiveSelection, dayEnd: string) {
  if (!ids.length) return false;
  const rows = (await db.readRows(ids)).filter(row => row.active);
  const nodeOrder = rows.map(row => row.node_id);
  const snapshot = { ...await db.scopedLearningSnapshot(nodeOrder), nodeOrder };
  const ready = new Set(cycleReadyNodeIds(snapshot, args.mode, args.now, args.settings));
  const later = new Set(cycleReadyNodeIds(snapshot, args.mode, dayEnd, args.settings));
  return rows.some(row => args.matches!(row, snapshot) && !ready.has(row.node_id) && later.has(row.node_id));
}

export function displayDiveSession(global: DailyFlowSession, dive: DiveFlowCursor, currentNodeId: string | null,
  currentItemStartedAt: string | null) {
  return cycleWindow({ ...global, dive, currentNodeId, currentItemStartedAt,
    isAnswerRevealed: false, completedAt: null, continueNodeId: null });
}
