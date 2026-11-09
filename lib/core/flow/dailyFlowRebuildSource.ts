import type { DailyFlowCommitArgs } from './dailyFlowContract.js';
import type { CycleStored } from './dailyFlowStore.js';

// Reordering unseen work must not reject an already-displayed action; learning facts are checked next.
export function acceptsRebuiltFlowSource(stored: CycleStored, args: DailyFlowCommitArgs) {
  const source = args.sourceSession;
  const current = stored.session;
  if (!source?.currentNodeId || current.rebuildSourceRevision === undefined || args.historyMode ||
    args.token.revision < current.rebuildSourceRevision || args.token.revision > stored.revision) return false;
  // Dive actions are checked against their admitted shared row, not the global card.
  if (source.dive) return !args.navigation && source.sessionStartedAt === current.sessionStartedAt;
  return source.currentNodeId === current.currentNodeId && source.currentItemStartedAt === current.currentItemStartedAt &&
    source.sessionStartedAt === current.sessionStartedAt;
}
