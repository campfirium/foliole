import { z } from 'zod';

import { hashTextBody } from '../database/textBodyHash.js';
import { definedProps } from '../definedProps.js';

import type { DailyFlowSession } from './dailyFlowSession.js';
import { dailyFlowSessionSchema } from './dailyFlowSessionSchema.js';

const position = z.object({ index: z.number().int().nonnegative(), id: z.string() });
const sequenceChange = z.object({ removed: z.array(position), added: z.array(position),
  before: z.string(), after: z.string() });
const queueHistory = z.object({ side: z.enum(['before', 'after']), queue: sequenceChange, soon: sequenceChange });
export const flowHistorySessionSchema = dailyFlowSessionSchema.and(
  z.object({ queueHistory: queueHistory.optional() }).transform(value => definedProps(value)));
export type FlowHistorySession = DailyFlowSession & { queueHistory?: z.infer<typeof queueHistory> };

function fingerprint(ids: string[]) { return hashTextBody(JSON.stringify(ids)); }

function change(before: string[], after: string[]): z.infer<typeof sequenceChange> {
  const target = new Map(after.map((id, index) => [id, index]));
  const retained = new Set<string>();
  let last = -1;
  // Retain the common subsequence; removed or repositioned IDs alone carry positions.
  for (const id of before) {
    const index = target.get(id);
    if (index !== undefined && index > last) { retained.add(id); last = index; }
  }
  const changed = (ids: string[]) => ids.flatMap((id, index) => retained.has(id) ? [] : [{ id, index }]);
  return { removed: changed(before), added: changed(after), before: fingerprint(before), after: fingerprint(after) };
}

export function compactFlowHistorySessions(before: FlowHistorySession, after: FlowHistorySession) {
  if (before.queueHistory || after.queueHistory) {
    if (!before.queueHistory || !after.queueHistory) throw new Error('flow_history_incomplete_delta');
    return { before, after };
  }
  const queue = change(before.queueNodeIds, after.queueNodeIds);
  const soon = change(before.soonNodeIds ?? [], after.soonNodeIds ?? []);
  const compact = (session: DailyFlowSession, side: 'before' | 'after'): FlowHistorySession => ({
    ...session, queueNodeIds: [], ...(session.soonNodeIds ? { soonNodeIds: [] } : {}),
    queueHistory: { side, queue, soon } });
  return { before: compact(before, 'before'), after: compact(after, 'after') };
}

function restore(ids: string[], delta: z.infer<typeof sequenceChange>, side: 'before' | 'after') {
  const actual = fingerprint(ids);
  if (actual === delta[side]) return [...ids];
  const other = side === 'before' ? 'after' : 'before';
  if (actual !== delta[other]) throw new Error('flow_history_changed');
  const removed = side === 'after' ? delta.removed : delta.added;
  const added = side === 'after' ? delta.added : delta.removed;
  const removals = new Set(removed.map(value => value.index));
  const retained = ids.filter((_, index) => !removals.has(index));
  const insertions = new Map(added.map(value => [value.index, value.id]));
  let cursor = 0;
  const result = Array.from({ length: retained.length + added.length }, (_, index) =>
    insertions.get(index) ?? retained[cursor++]!);
  if (fingerprint(result) !== delta[side]) throw new Error('flow_history_invalid_delta');
  return result;
}

export function restoreFlowHistorySession(saved: FlowHistorySession, current: DailyFlowSession): DailyFlowSession {
  const { queueHistory: delta, ...session } = saved;
  if (!delta) return { ...session, queueNodeIds: [...session.queueNodeIds],
    ...(session.soonNodeIds ? { soonNodeIds: [...session.soonNodeIds] } : {}) };
  return { ...session, queueNodeIds: restore(current.queueNodeIds, delta.queue, delta.side),
    ...(session.soonNodeIds ? { soonNodeIds: restore(current.soonNodeIds ?? [], delta.soon, delta.side) } : {}) };
}

export function matchesFlowHistoryQueues(saved: FlowHistorySession, current: DailyFlowSession) {
  const delta = saved.queueHistory;
  return delta ? fingerprint(current.queueNodeIds) === delta.queue[delta.side] &&
    fingerprint(current.soonNodeIds ?? []) === delta.soon[delta.side] :
    JSON.stringify(saved.queueNodeIds) === JSON.stringify(current.queueNodeIds) &&
    JSON.stringify(saved.soonNodeIds ?? []) === JSON.stringify(current.soonNodeIds ?? []);
}
