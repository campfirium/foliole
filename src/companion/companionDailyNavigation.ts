import { dailyFlowOperationId, retainDailyFlowRetry, settleDailyFlowRetry } from '../../lib/core/flow/dailyFlowRetry';
import { commitDailyFlow } from '../../lib/core/flow/dailyFlowService';
import type { ReviewSessionMode } from '../features/review/model/reviewSessionMode';
import { getCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import { companionDailyFlowPersistence, companionDailyFlowSettings } from '../shared/platform/companion/runtime/companionDailyFlow';
import { applyCompanionFlowReceipt, openCompanionDailyFlowForDisplay as openCompanionDailyFlow } from '../shared/platform/companion/runtime/companionDailyFlowDisplay';
import { writeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';
import type { ReviewSessionState } from '../store/workspaceStoreTypes';

import type { FlowOwner, useCompanionFlowSession } from './useCompanionFlowSession';

export async function saveCompanionDailyNavigation(source: ReviewSessionState, now = new Date().toISOString()) {
  const token = source.daily!;
  const target = source.continueNodeId!;
  const args = retainDailyFlowRetry({ opId: dailyFlowOperationId(token, target, 'continue-reading'),
    now, token, navigation: 'continue-reading', expectedContinueNodeId: target });
  const result = await writeIosCompanionDatabase(db => commitDailyFlow(db, args,
    companionDailyFlowSettings(), companionDailyFlowPersistence));
  settleDailyFlowRetry(args.opId);
  return result;
}

export async function continueCompanionDailyFlow(args: Parameters<typeof useCompanionFlowSession>[0],
  current: FlowOwner, owner: { current: FlowOwner }, mode: ReviewSessionMode, render: () => void) {
  if (owner.current !== current || !args.active || !args.snapshot || !current.hydrated ||
    current.scope !== getCompanionReadingScope() || (current.session.reviewedItemCount ?? 0) <= 0 || current.session.currentNodeId || !current.session.continueNodeId) return;
  const source = current.session;
  const matches = () => owner.current === current && current.session === source && current.scope === getCompanionReadingScope();
  try {
    if (!source.daily) throw new Error('daily_flow_storage_unavailable');
    const saved = await saveCompanionDailyNavigation(source);
    if (saved.session) await applyCompanionFlowReceipt({ ...saved, session: saved.session }, args.snapshot);
    if (!matches() || !saved.session) return;
    current.session = saved.session;
    current.generation += 1;
    render();
  } catch (error) {
    if (!matches()) return;
    if (/daily_flow_(changed|learning_changed|ack_superseded)/.test(String(error))) {
      const saved = await openCompanionDailyFlow({ now: new Date().toISOString(), mode, refresh: true,
        preferredNodeId: source.currentNodeId, seed: source });
      if (!matches()) return;
      current.session = saved.session;
      current.generation += 1;
      render();
    }
    throw error;
  }
}
