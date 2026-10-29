import type { ReviewQueueNode } from '../review/queue/reviewQueuePlanner.js';

import type { DailyFlowPersistence } from './dailyFlowService.js';

const MAX_FACTS = 128;

// Own this reader inside one database transaction; never share facts across commits.
export function transactionDailyFlowPersistence(persistence: DailyFlowPersistence): DailyFlowPersistence {
  const facts = new Map<string, ReviewQueueNode | undefined>();
  const trashed = new Set<string>();
  const clear = () => { facts.clear(); trashed.clear(); };
  return {
    ...(persistence.readingPreservesPosition ? { readingPreservesPosition: true } : {}),
    snapshot: persistence.snapshot.bind(persistence),
    async learningSnapshot(db, ids) {
      if (!ids) {
        clear();
        return persistence.learningSnapshot(db);
      }
      const missing = [...new Set(ids.filter(id => !facts.has(id)))];
      if (missing.length) {
        const loaded = await persistence.learningSnapshot(db, missing);
        for (const id of missing) facts.set(id, loaded.nodesById[id]);
        for (const id of loaded.trashedNodeIds) trashed.add(id);
      }
      const snapshot = { nodeOrder: [...ids], nodesById: Object.fromEntries(ids.flatMap(id => {
        const node = facts.get(id);
        return node ? [[id, node]] : [];
      })), trashedNodeIds: ids.filter(id => trashed.has(id)) };
      while (facts.size > MAX_FACTS) {
        const id = facts.keys().next().value!;
        facts.delete(id);
        trashed.delete(id);
      }
      return snapshot;
    },
    async grade(...args) {
      clear();
      return persistence.grade(...args);
    },
    async reading(...args) {
      const result = await persistence.reading(...args);
      const value = args[1];
      const known = facts.get(value.nodeId);
      if (known) facts.set(value.nodeId, { ...known, reading: value.after ? { ...value.after,
        readingPosition: persistence.readingPreservesPosition
          ? known.reading?.readingPosition ?? value.after.readingPosition : value.after.readingPosition } : null });
      else facts.delete(value.nodeId);
      return result;
    },
    async reviewHistory(...args) {
      clear();
      return persistence.reviewHistory(...args);
    }
  };
}
