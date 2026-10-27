import type { WorkspaceNodeSnapshot } from '../database/workspaceSnapshotHelpers.js';

import type { DailyFlowPersistence } from './dailyFlowService.js';

const MAX_FACTS = 128;

// Own this reader inside one database transaction; never share facts across commits.
export function transactionDailyFlowPersistence(persistence: DailyFlowPersistence): DailyFlowPersistence {
  const facts = new Map<string, WorkspaceNodeSnapshot | undefined>();
  const trashed = new Set<string>();
  const clear = () => { facts.clear(); trashed.clear(); };
  return {
    async snapshot(db, ids) {
      if (!ids) {
        clear();
        return persistence.snapshot(db);
      }
      const missing = [...new Set(ids.filter(id => !facts.has(id)))];
      if (missing.length) {
        const loaded = await persistence.snapshot(db, missing);
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
      clear();
      return persistence.reading(...args);
    },
    async reviewHistory(...args) {
      clear();
      return persistence.reviewHistory(...args);
    }
  };
}
