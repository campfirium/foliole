import { commitDailyFlow } from '../../lib/core/flow/dailyFlowService';
import { companionDailyFlowPersistence, companionDailyFlowSettings } from '../shared/platform/companion/runtime/companionDailyFlow';
import { writeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';
import type { ReviewSessionState } from '../store/workspaceStoreTypes';

export async function saveCompanionDailyNavigation(source: ReviewSessionState, target: ReviewSessionState) {
  const result = await writeIosCompanionDatabase(db => commitDailyFlow(db, { opId: crypto.randomUUID(),
    now: new Date().toISOString(), token: source.daily!, sourceSession: source, nextSession: target },
  companionDailyFlowSettings(), companionDailyFlowPersistence));
  return result.session;
}
