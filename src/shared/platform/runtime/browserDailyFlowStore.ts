import { cycleStateToSave, type DailyFlowStore } from '../../../../lib/core/flow/dailyFlowStore';
import type { WorkspaceState } from '../../../store/workspaceStoreTypes';

import { browserDailyFlowFacts } from './browserDailyFlowFacts';
import { emptyBrowserDailyFlow } from './browserDailyFlowState';

export type BrowserFlowWorkspace = Pick<WorkspaceState, 'nodesById' | 'nodeOrder' | 'trashedNodeIds'> & {
  browserDailyFlow?: import('./browserDailyFlowState').BrowserDailyFlowState;
};

export function createBrowserDailyFlowStore(get: () => BrowserFlowWorkspace,
  set: (patch: Partial<BrowserFlowWorkspace>) => void): DailyFlowStore {
  const flow = () => get().browserDailyFlow ?? emptyBrowserDailyFlow();
  const updateFlow = (patch: Partial<ReturnType<typeof flow>>) => set({ browserDailyFlow: { ...flow(), ...patch } });
  const snapshot = async (ids?: readonly string[]) => {
    const state = get();
    const nodeOrder = ids ? [...ids].filter(id => Boolean(state.nodesById[id])) : state.nodeOrder;
    return { nodeOrder, nodesById: Object.fromEntries(nodeOrder.flatMap(id => {
      const node = state.nodesById[id];
      return node ? [[id, { ...node, isTitleManual: Boolean(node.isTitleManual), hideTitleHeading: Boolean(node.hideTitleHeading),
        anchorLink: node.anchorLink ?? null, reading: node.reading ?? null, review: node.review ?? null }]] : [];
    })), trashedNodeIds: state.trashedNodeIds.filter(id => nodeOrder.includes(id)) };
  };
  return {
    readState: async () => structuredClone(flow().state),
    readRows: async ids => flow().rows.filter(row => !ids || ids.includes(row.node_id)).sort((a, b) => a.order_key - b.order_key).map(row => ({ ...row })),
    scanRows: async (after, through, count) => flow().rows.filter(row => row.active && row.order_key > after && row.order_key <= through)
      .sort((a, b) => a.order_key - b.order_key).slice(0, count).map(row => ({ ...row })),
    async writeRows(rows) {
      const replaced = new Set(rows.map(row => row.node_id));
      updateFlow({ rows: [...flow().rows.filter(row => !replaced.has(row.node_id)), ...rows]
        .sort((a, b) => a.order_key - b.order_key) });
    },
    async deleteRows(ids) { updateFlow({ rows: flow().rows.filter(row => !ids.includes(row.node_id)) }); },
    async resetCycle() { updateFlow({ rows: [], operations: {} }); },
    async saveState(args) {
      const state = cycleStateToSave(args);
      updateFlow({ state });
      return state.session;
    },
    readOperation: async id => flow().operations[id] ?? null,
    async saveOperation(id, value) { updateFlow({ operations: { ...flow().operations, [id]: value } }); },
    learningSnapshot: snapshot,
    async scopedLearningSnapshot(ids) {
      const selected = new Set<string>();
      for (const id of ids) {
        let next = id;
        while (next && !selected.has(next)) {
          selected.add(next);
          next = get().nodesById[next]?.parentNodeId;
        }
      }
      return snapshot([...selected]);
    },
    snapshot,
    ...browserDailyFlowFacts(get, set)
  };
}
