import { hashTextBodyAsync } from '../database/textBodyHash.js';

import type { DailyFlowSession } from './dailyFlowSession.js';
import { compactFlowHistorySessions, restoreFlowHistorySession, restoreFlowSequenceCandidate,
  type FlowHistorySession } from './flowHistorySession.js';

export async function compactFlowHistorySessionsAsync(before: FlowHistorySession, after: FlowHistorySession) {
  if (before.queueHistory || after.queueHistory) return compactFlowHistorySessions(before, after);
  const copy = (session: FlowHistorySession): FlowHistorySession => ({ ...session,
    ...(session.daily ? { daily: { ...session.daily } } : {}),
    queueNodeIds: [...session.queueNodeIds], ...(session.soonNodeIds ? { soonNodeIds: [...session.soonNodeIds] } : {}) });
  const source = copy(before);
  const target = copy(after);
  const values = [source.queueNodeIds, target.queueNodeIds, source.soonNodeIds ?? [], target.soonNodeIds ?? []]
    .map(ids => JSON.stringify(ids));
  const digests = await Promise.all(values.map(hashTextBodyAsync));
  const known = new Map(values.map((value, index) => [value, digests[index]!]));
  return compactFlowHistorySessions(source, target, ids => {
    const digest = known.get(JSON.stringify(ids));
    if (!digest) throw new Error('flow_history_digest_missing');
    return digest;
  });
}

async function restoreSequence(ids: string[], delta: NonNullable<FlowHistorySession['queueHistory']>['queue'],
  side: 'before' | 'after') {
  const candidate = restoreFlowSequenceCandidate(ids, delta, side, await hashTextBodyAsync(JSON.stringify(ids)));
  if (candidate.expected && await hashTextBodyAsync(JSON.stringify(candidate.ids)) !== candidate.expected) {
    throw new Error('flow_history_invalid_delta');
  }
  return candidate.ids;
}

export async function restoreFlowHistorySessionAsync(saved: FlowHistorySession, current: DailyFlowSession): Promise<DailyFlowSession> {
  const { queueHistory, ...session } = saved;
  if (!queueHistory) return restoreFlowHistorySession(saved, current);
  if (session.daily) session.daily = { ...session.daily };
  const copyChange = (change: typeof queueHistory.queue) => ({ ...change,
    removed: change.removed.map(value => ({ ...value })), added: change.added.map(value => ({ ...value })) });
  const delta = { ...queueHistory, queue: copyChange(queueHistory.queue), soon: copyChange(queueHistory.soon) };
  const sourceQueue = [...current.queueNodeIds];
  const sourceSoon = [...(current.soonNodeIds ?? [])];
  const [queue, soon] = await Promise.all([restoreSequence(sourceQueue, delta.queue, delta.side),
    session.soonNodeIds ? restoreSequence(sourceSoon, delta.soon, delta.side) : undefined]);
  return { ...session, queueNodeIds: queue, ...(soon ? { soonNodeIds: soon } : {}) };
}
