import { hashTextBody } from '../database/textBodyHash.js';

import type { DailyFlowCommitArgs } from './dailyFlowContract.js';
import type { DailyFlowSession } from './dailyFlowSession.js';
import { compactFlowHistorySessions } from './flowHistorySession.js';
import { compactFlowHistorySessionsAsync } from './flowHistorySessionAsync.js';

const pending = new Map<string, DailyFlowCommitArgs>();

export function dailyFlowOperationId(token: NonNullable<DailyFlowSession['daily']>, nodeId: string, action: string) {
  return `daily-${hashTextBody(JSON.stringify([token, nodeId, action]))}`;
}

export function retainDailyFlowRetry(args: DailyFlowCommitArgs) {
  const existing = pending.get(args.opId);
  if (existing) return existing;
  if (args.sourceSession) {
    const pair = compactFlowHistorySessions(args.sourceSession, args.nextSession ?? args.sourceSession);
    args = { ...args, sourceSession: pair.before, ...(args.nextSession ? { nextSession: pair.after } : {}) };
  }
  pending.set(args.opId, args);
  if (pending.size > 100) pending.delete(pending.keys().next().value!);
  return args;
}

export function settleDailyFlowRetry(opId: string) {
  pending.delete(opId);
}


export async function retainDailyFlowRetryAsync(args: DailyFlowCommitArgs) {
  const existing = pending.get(args.opId);
  if (existing) return existing;
  if (args.sourceSession) {
    const pair = await compactFlowHistorySessionsAsync(args.sourceSession, args.nextSession ?? args.sourceSession);
    args = { ...args, sourceSession: pair.before, ...(args.nextSession ? { nextSession: pair.after } : {}) };
  }
  return retainDailyFlowRetry(args);
}
