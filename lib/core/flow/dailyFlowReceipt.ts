import type { DailyFlowLearningSnapshot } from './dailyFlowContract.js';
import type { DailyFlowStore } from './dailyFlowStore.js';

export function currentFlowLearning(snapshot: DailyFlowLearningSnapshot, id: string | null | undefined) {
  const node = snapshot.nodesById[id ?? ''];
  return id && node ? { [id]: { reading: node.reading ?? null, review: node.review ?? null } } : undefined;
}

export async function readCurrentFlowLearning(db: DailyFlowStore, id: string | null) {
  if (!id) return undefined;
  return currentFlowLearning(await db.learningSnapshot([id]), id);
}
