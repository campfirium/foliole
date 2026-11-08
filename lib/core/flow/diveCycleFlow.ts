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

function matchesDive(dive: DiveFlowCursor, topics = new Set(dive.topicIds)) {
  return (row: { node_id: string; initial_task: number }, snapshot: DailyFlowLearningSnapshot) =>
    (dive.phase !== 'initial' || Boolean(row.initial_task)) &&
    (dive.phase !== 'topics' || snapshot.nodesById[row.node_id]?.kind === 'topic') &&
    belongsToDive(row.node_id, topics, snapshot.nodesById);
}

const selectionMode = (dive: DiveFlowCursor) => dive.phase === 'topics' ? 'reading-only' : dive.mode;

export async function assertDiveCurrent(db: DailyFlowStore, source: DailyFlowSession, snapshot: DailyFlowLearningSnapshot,
  now: string, settings: DailyFlowSettings) {
  const dive = source.dive!;
  const id = source.currentNodeId;
  const [row] = id ? await db.readRows([id]) : [];
  if (!row?.active || dive.stop || row.order_key !== dive.position || row.order_key > dive.limit ||
    !matchesDive(dive)(row, snapshot) ||
    !cycleReadyNodeIds(snapshot, selectionMode(dive), now, settings).includes(row.node_id)) {
    throw new Error('daily_flow_learning_changed');
  }
}

export function openDiveCurrent(db: DailyFlowStore, global: DailyFlowSession, args: DailyFlowOpenArgs,
  settings: DailyFlowSettings) {
  const scope = args.dive!;
  const seed = args.seed;
  const previous = seed?.daily?.dayKey === global.daily?.dayKey && seed?.daily?.scope === global.daily?.scope &&
    seed?.dive?.id === scope.id && seed.dive.mode === args.mode ? seed.dive : undefined;
  const phase = previous?.stop && args.diveStep === 'continue'
    ? previous.phase === 'initial' ? 'today' : 'topics'
    : previous?.phase ?? 'initial';
  if (previous && !args.diveStep && previous.stop) return displayDiveSession(global, previous, null, null);
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
  // Traverse shared rows with a private cursor and the boundary captured at entry.
  const cycle = { ...global.cycle!, scanAfter: dive.position, lapLimit: dive.limit };
  const matches = matchesDive(dive);
  const mode = selectionMode(dive);
  const dayEnd = global.dayWindow && new Date(Date.parse(global.dayWindow.end) - 1).toISOString();
  let waiting = dive.waiting;
  const row = dive.topicIds.length ? await scanCycleRange(db, cycle, { mode, now, settings, matches,
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
