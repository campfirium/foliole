import type { DailyFlowSession } from './dailyFlowSession.js';
import { compactFlowHistorySessions, restoreFlowHistorySession, type FlowHistorySession } from './flowHistorySession.js';

type SessionEntry = { beforeContext?: { reviewSession: FlowHistorySession };
  afterContext?: { reviewSession: FlowHistorySession };
  beforeSession?: FlowHistorySession | null; afterSession?: FlowHistorySession | null; type?: string };

export function compactFlowHistoryEntry<T>(value: T): T {
  if (!value || typeof value !== 'object') return value;
  const entry = value as T & SessionEntry;
  if (entry.beforeContext && entry.afterContext) {
    const pair = compactFlowHistorySessions(entry.beforeContext.reviewSession, entry.afterContext.reviewSession);
    return { ...entry, beforeContext: { ...entry.beforeContext, reviewSession: pair.before },
      afterContext: { ...entry.afterContext, reviewSession: pair.after } };
  }
  if (entry.beforeSession || entry.afterSession) {
    const pair = compactFlowHistorySessions(entry.beforeSession ?? entry.afterSession!, entry.afterSession ?? entry.beforeSession!);
    return { ...entry, ...(entry.beforeSession ? { beforeSession: pair.before } : {}),
      ...(entry.afterSession ? { afterSession: pair.after } : {}) };
  }
  return value;
}

export function restoreFlowHistoryEntry<T>(value: T, current: DailyFlowSession): T {
  const entry = value as T & SessionEntry;
  if (entry.beforeContext && entry.afterContext) return { ...entry,
    beforeContext: { ...entry.beforeContext, reviewSession: restoreFlowHistorySession(entry.beforeContext.reviewSession, current) },
    afterContext: { ...entry.afterContext, reviewSession: restoreFlowHistorySession(entry.afterContext.reviewSession, current) } };
  if (entry.beforeSession || entry.afterSession) return { ...entry,
    ...(entry.beforeSession ? { beforeSession: restoreFlowHistorySession(entry.beforeSession, current) } : {}),
    ...(entry.afterSession ? { afterSession: restoreFlowHistorySession(entry.afterSession, current) } : {}) };
  return value;
}

/** A replayed grade recalculates its due time; carry that expected value up to the next grade. */
export function rebaseFollowingFlowHistoryDue<T>(stack: T[], previous: T | undefined, replayed: T): T[] {
  const old = previous as SessionEntry | undefined;
  const next = replayed as SessionEntry;
  if (old?.type !== 'review.grade' || next.type !== 'review.grade') return stack;
  const before = old.afterContext?.reviewSession.nextReviewDueAt;
  const after = next.afterContext?.reviewSession.nextReviewDueAt;
  if (before === after) return stack;
  const result = [...stack];
  for (let i = result.length - 1; i >= 0; i--) {
    const entry = result[i] as T & SessionEntry;
    const source = entry.beforeContext?.reviewSession ?? entry.beforeSession;
    if (!source || source.nextReviewDueAt !== before) break;
    const update = (session: FlowHistorySession) => session.nextReviewDueAt === before
      ? { ...session, nextReviewDueAt: after } : session;
    result[i] = { ...entry,
      ...(entry.beforeContext ? { beforeContext: { ...entry.beforeContext, reviewSession: update(source) } } :
        { beforeSession: update(source) }),
      ...(entry.type === 'review.grade' ? {} : entry.afterContext ? { afterContext: {
        ...entry.afterContext, reviewSession: update(entry.afterContext.reviewSession) } } :
        entry.afterSession ? { afterSession: update(entry.afterSession) } : {}) };
    if (entry.type === 'review.grade') break;
  }
  return result;
}
