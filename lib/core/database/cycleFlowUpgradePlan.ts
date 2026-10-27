import { changeCycleHash, cycleStamp } from '../flow/cycleFlowFingerprint.js';
import { EMPTY_CYCLE_HASH, type CycleRow } from '../flow/cycleFlowTypes.js';
import { dailyFlowSessionSchema } from '../flow/dailyFlowSessionSchema.js';

export type LegacyFlowState = { session_json: string; day_key: string; mode: string; settings_key: string;
  revision: number; invalidated: number; updated_at: string };
export type LegacyFlowRow = { node_id: string; initial_position: number; queue_position: number | null; soon_position: number | null };

export function planCycleFlowUpgrade(state: LegacyFlowState | undefined, entries: LegacyFlowRow[]) {
  if (!state) return { rows: [] as CycleRow[], session: null };
  const queue = entries.filter(row => row.queue_position !== null).sort((a, b) => a.queue_position! - b.queue_position!).map(row => row.node_id);
  const visibleSoon = entries.filter(row => row.soon_position !== null).sort((a, b) => a.soon_position! - b.soon_position!).map(row => row.node_id);
  const source = dailyFlowSessionSchema.parse({ ...JSON.parse(state.session_json), queueNodeIds: queue, soonNodeIds: visibleSoon });
  const popped = source.currentNodeId && !queue.includes(source.currentNodeId) ? [source.currentNodeId] : [];
  const soon = [...new Set([...(source.hiddenSoonNodeIds ?? []), ...visibleSoon])].filter(id => !popped.includes(id));
  const ids = [...new Set([...queue, ...popped, ...soon, ...entries.sort((a, b) => a.initial_position - b.initial_position).map(row => row.node_id)])];
  const rows: CycleRow[] = ids.map((node_id, index) => ({ node_id, order_key: index + 1, active: 1,
    handled: queue.includes(node_id) ? 0 : 1, cohort: queue.includes(node_id) ? 'queue' : soon.includes(node_id) ? 'soon' : 'none',
    initial_task: queue.includes(node_id) ? 1 : 0 }));
  const cycle = { clearKey: queue.length, clearedAt: queue.length ? null : source.completedAt ?? null,
    scanAfter: rows.find(row => row.node_id === source.currentNodeId)?.order_key ?? 0,
    lapLimit: rows.length, tailKey: rows.length, rowsHash: changeCycleHash(EMPTY_CYCLE_HASH, [], rows),
    stamp: '', remaining: queue.length, reviewRemaining: 0 };
  const session = { ...source, flowFormat: 'cycle-v1' as const, cycle };
  cycle.stamp = cycleStamp(cycle, session);
  // The original mode partitions Soon. The legacy reader must reproduce that partition exactly.
  return { rows, session };
}

export function tagLegacyFlowHistory(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('flow_history_unavailable');
  const record = value as Record<string, unknown>;
  const session = (source: unknown) => {
    if (!source || typeof source !== 'object') return source;
    const saved = source as Record<string, unknown>;
    if (saved.flowFormat && saved.flowFormat !== 'legacy-queue-v1') throw new Error('flow_history_format_changed');
    return { ...saved, flowFormat: 'legacy-queue-v1' };
  };
  const entry = (source: unknown) => {
    if (!source || typeof source !== 'object') throw new Error('flow_history_unavailable');
    const saved = source as Record<string, unknown>;
    const context = (key: string) => saved[key] && typeof saved[key] === 'object'
      ? { ...(saved[key] as object), reviewSession: session((saved[key] as Record<string, unknown>).reviewSession) } : saved[key];
    return { ...saved, ...(saved.beforeContext ? { beforeContext: context('beforeContext') } : {}),
      ...(saved.afterContext ? { afterContext: context('afterContext') } : {}),
      ...(saved.beforeSession ? { beforeSession: session(saved.beforeSession) } : {}),
      ...(saved.afterSession ? { afterSession: session(saved.afterSession) } : {}) };
  };
  if (!Array.isArray(record.undoStack) || !Array.isArray(record.redoStack)) throw new Error('flow_history_unavailable');
  return { ...record, undoStack: record.undoStack.map(entry), redoStack: record.redoStack.map(entry),
    ...(record.resumeSession ? { resumeSession: session(record.resumeSession) } : {}) };
}
