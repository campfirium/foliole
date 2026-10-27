import type { CycleState } from './cycleFlowTypes.js';
import type { FlowHistorySession } from './flowHistorySession.js';

export function cloneCycleState(value: CycleState): CycleState {
  const { change, ...meta } = value;
  return { ...meta, ...(change ? { change: { before: change.before.map(row => ({ ...row })),
    after: change.after.map(row => ({ ...row })), source: { ...change.source }, target: { ...change.target } } } : {}) };
}

export function compactCycleSession(value: FlowHistorySession, source = false): FlowHistorySession {
  if (value.flowFormat !== 'cycle-v1' || !value.cycle) throw new Error('flow_history_format_changed');
  if (value.queueHistory) throw new Error('flow_history_mixed_format');
  const cycle = cloneCycleState(value.cycle);
  if (source) delete cycle.change;
  return { ...value, cycle, queueNodeIds: [], soonNodeIds: [], hiddenSoonNodeIds: [] };
}

export function compactCyclePair(before: FlowHistorySession, after: FlowHistorySession) {
  if (before.flowFormat !== 'cycle-v1' && after.flowFormat !== 'cycle-v1') return null;
  return { before: compactCycleSession(before, true), after: compactCycleSession(after) };
}
