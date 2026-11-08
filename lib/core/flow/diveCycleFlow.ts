import type { ReviewQueueNode } from '../review/queue/reviewQueuePlanner.js';

import { cycleReadyNodeIds, cycleWindow, scanCycleRange } from './cycleFlowSelection.js';
import type { DailyFlowLearningSnapshot, DailyFlowSettings } from './dailyFlowContract.js';
import type { DailyFlowSession } from './dailyFlowSession.js';
import type { DailyFlowStore } from './dailyFlowStore.js';

type DiveCursor = NonNullable<DailyFlowSession['dive']>;

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

export async function assertDiveCurrent(db: DailyFlowStore, source: DailyFlowSession, snapshot: DailyFlowLearningSnapshot,
  now: string, settings: DailyFlowSettings) {
  const dive = source.dive!;
  const id = source.currentNodeId;
  const [row] = id ? await db.readRows([id]) : [];
  if (!row?.active || !row.initial_task || row.order_key !== dive.position ||
    !belongsToDive(row.node_id, new Set(dive.topicIds), snapshot.nodesById) ||
    !cycleReadyNodeIds(snapshot, dive.mode, now, settings).includes(row.node_id)) {
    throw new Error('daily_flow_learning_changed');
  }
}

export async function selectDiveCurrent(db: DailyFlowStore, global: DailyFlowSession, dive: DiveCursor,
  now: string, settings: DailyFlowSettings) {
  const topics = new Set(dive.topicIds);
  // The shared scanner may move its cursor and mark Queue Clear on this copy.
  const cycle = { ...global.cycle!, scanAfter: dive.position, lapLimit: global.cycle!.clearKey };
  const row = topics.size ? await scanCycleRange(db, cycle, { mode: dive.mode, now, settings,
    matches: (candidate, snapshot) => Boolean(candidate.initial_task) && belongsToDive(candidate.node_id, topics, snapshot.nodesById)
  }) : null;
  return displayDiveSession(global, { ...dive, position: row?.order_key ?? cycle.lapLimit },
    row?.node_id ?? null, row ? now : null);
}

export function displayDiveSession(global: DailyFlowSession, dive: DiveCursor, currentNodeId: string | null,
  currentItemStartedAt: string | null) {
  return cycleWindow({ ...global, dive, currentNodeId, currentItemStartedAt,
    isAnswerRevealed: false, completedAt: null, continueNodeId: null });
}
