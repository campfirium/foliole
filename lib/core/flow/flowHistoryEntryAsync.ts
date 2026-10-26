import type { DailyFlowSession } from './dailyFlowSession.js';
import type { FlowHistorySession } from './flowHistorySession.js';
import { compactFlowHistorySessionsAsync, restoreFlowHistorySessionAsync } from './flowHistorySessionAsync.js';

type SessionEntry = { beforeContext?: { reviewSession: FlowHistorySession }; afterContext?: { reviewSession: FlowHistorySession };
  beforeSession?: FlowHistorySession | null; afterSession?: FlowHistorySession | null };

function sessions(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const entry = value as SessionEntry;
  if (entry.beforeContext && entry.afterContext) return {
    before: entry.beforeContext.reviewSession, after: entry.afterContext.reviewSession };
  if (entry.beforeSession || entry.afterSession) return {
    before: entry.beforeSession ?? entry.afterSession!, after: entry.afterSession ?? entry.beforeSession! };
  return null;
}

function replace<T>(value: T, pair: { before: FlowHistorySession; after: FlowHistorySession }): T {
  const entry = value as T & SessionEntry;
  if (entry.beforeContext && entry.afterContext) return { ...entry,
    beforeContext: { ...entry.beforeContext, reviewSession: pair.before },
    afterContext: { ...entry.afterContext, reviewSession: pair.after } };
  return { ...entry, ...(entry.beforeSession ? { beforeSession: pair.before } : {}),
    ...(entry.afterSession ? { afterSession: pair.after } : {}) };
}

export async function compactFlowHistoryEntryAsync<T>(value: T): Promise<T> {
  const pair = sessions(value);
  if (!pair) return value;
  const source = replace(value, pair);
  return replace(source, await compactFlowHistorySessionsAsync(pair.before, pair.after));
}

export async function restoreFlowHistoryEntryAsync<T>(value: T, current: DailyFlowSession): Promise<T> {
  const pair = sessions(value);
  if (!pair) return value;
  const source = replace(value, pair);
  const [before, after] = await Promise.all([restoreFlowHistorySessionAsync(pair.before, current),
    restoreFlowHistorySessionAsync(pair.after, current)]);
  return replace(source, { before, after });
}
