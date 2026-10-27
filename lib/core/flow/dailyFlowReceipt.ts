import type { DbPort } from '../sync/dbPort.js';

import type { DailyFlowLearningSnapshot } from './dailyFlowContract.js';
import type { DailyFlowPersistence } from './dailyFlowService.js';

export function currentFlowLearning(snapshot: DailyFlowLearningSnapshot, id: string | null | undefined) {
  const node = snapshot.nodesById[id ?? ''];
  return id && node ? { [id]: { reading: node.reading ?? null, review: node.review ?? null } } : undefined;
}

export async function readCurrentFlowLearning(db: DbPort, persistence: DailyFlowPersistence, id: string | null) {
  if (!id) return undefined;
  return currentFlowLearning(await persistence.learningSnapshot(db, [id]), id);
}
