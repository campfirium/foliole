import type { ReviewQueueNode } from '../review/queue/reviewQueuePlanner.js';

import { cycleReadyNodeIds, cycleWindow, scanCycleRange } from './cycleFlowSelection.js';
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
    ? { ...scope, mode: args.mode, phase, position: 0, hasWork: false, waiting: false, stop: null,
      limit: phase === 'initial' ? global.cycle!.clearKey
        : args.diveStep === 'retry' && previous ? previous.limit : global.cycle!.tailKey }
    : { ...previous, position: seed?.currentNodeId ? Math.max(0, previous.position - 1) : previous.position };
  return selectDiveCurrent(db, global, dive, args.now, settings);
}

export async function selectDiveCurrent(db: DailyFlowStore, global: DailyFlowSession, dive: DiveFlowCursor,
  now: string, settings: DailyFlowSettings) {
  if (dive.stop) return displayDiveSession(global, dive, null, null);
  if (!db.readDiveMembers) throw new Error('daily_flow_dive_unavailable');
  const memberIds = await db.readDiveMembers(dive.id);
  if (dive.memberIds?.length !== memberIds.length || memberIds.some((id, index) => id !== dive.memberIds?.[index])) {
    // A new member may precede the cursor. The shared row's schedule and this round's limit still apply.
    dive = { ...dive, memberIds, position: 0, waiting: false };
  }
  // Traverse shared rows with a private cursor and the boundary captured at entry.
  const cycle = { ...global.cycle!, scanAfter: dive.position, lapLimit: dive.limit };
  const members = new Set(memberIds);
  const matches = (row: { node_id: string; initial_task: number }, snapshot: DailyFlowLearningSnapshot) =>
    members.has(row.node_id) && matchesPhase(dive, row, snapshot);
  const mode = selectionMode(dive);
  const dayEnd = global.dayWindow && new Date(Date.parse(global.dayWindow.end) - 1).toISOString();
  let waiting = dive.waiting;
  const row = members.size ? await scanCycleRange(db, cycle, { mode, now, settings, matches,
    onSkipped: (candidate, snapshot) => {
      if (!waiting && dayEnd && dive.phase !== 'initial' && matches(candidate, snapshot)) {
        waiting = cycleReadyNodeIds({ ...snapshot, nodeOrder: [candidate.node_id] }, mode, dayEnd, settings)
          .includes(candidate.node_id);
      }
    }
  }) : null;
  const stop = row ? null : waiting ? 'waiting' : dive.hasWork ? 'finished' : 'empty';
  return displayDiveSession(global, { ...dive, position: row?.order_key ?? dive.limit,
    hasWork: dive.hasWork || Boolean(row), waiting, stop }, row?.node_id ?? null, row ? now : null);
}

export function displayDiveSession(global: DailyFlowSession, dive: DiveFlowCursor, currentNodeId: string | null,
  currentItemStartedAt: string | null) {
  return cycleWindow({ ...global, dive, currentNodeId, currentItemStartedAt,
    isAnswerRevealed: false, completedAt: null, continueNodeId: null });
}
