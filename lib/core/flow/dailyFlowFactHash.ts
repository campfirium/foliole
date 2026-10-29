import { computeSyncContentHash } from '../database/syncState.js';

import type { DailyFlowSyncFact } from './dailyFlowSyncFact.js';

/** Preserve the existing logical identity independently of its relational storage or wire layout. */
export function dailyFlowFactHash(fact: DailyFlowSyncFact) {
  return computeSyncContentHash('daily_flow', JSON.parse(JSON.stringify(fact)));
}
