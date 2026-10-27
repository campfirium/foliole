import type { DailyFlowOpenArgs, DailyFlowResult } from '../../../../../lib/core/flow/dailyFlowContract';
import type { DailyFlowSession } from '../../../../../lib/core/flow/dailyFlowSession';
import { mergeDailyFlowReceiptNodes } from '../../../../store/workspaceDailyFlowReceipt';
import { refreshCompanionWorkspaceAfterMutation } from '../companionWorkspaceRepository';
import { companionWorkspaceSnapshots } from '../companionWorkspaceSnapshotStore';
import { getCompanionReadingScope } from '../reading/companionReadingScope';

import { companionDailyFlowSettings, openCompanionDailyFlow } from './companionDailyFlow';

export async function ensureCompanionFlowDisplay(session: DailyFlowSession) {
  const scope = getCompanionReadingScope();
  for (const id of [session.currentNodeId, session.continueNodeId]) {
    if (scope !== getCompanionReadingScope()) return;
    const snapshot = companionWorkspaceSnapshots.getSnapshot();
    if (id && snapshot && !snapshot.nodesById[id]) await refreshCompanionWorkspaceAfterMutation(undefined, id);
  }
}

export async function openCompanionDailyFlowForDisplay(args: DailyFlowOpenArgs) {
  const before = companionWorkspaceSnapshots.getSnapshot();
  const result = await openCompanionDailyFlow(args);
  await applyCompanionFlowReceipt(result, before);
  return result;
}

export async function applyCompanionFlowReceipt(result: DailyFlowResult,
  before: ReturnType<typeof companionWorkspaceSnapshots.getSnapshot>) {
  if (result.session.daily && result.session.daily.scope !== companionDailyFlowSettings().scope) return;
  const scope = getCompanionReadingScope();
  const baseline = companionWorkspaceSnapshots.getSnapshot();
  await companionWorkspaceSnapshots.updateDerived(baseline, current => {
    if (!current || !before || scope !== getCompanionReadingScope()) return current;
    const nodesById = mergeDailyFlowReceiptNodes(current.nodesById, before.nodesById, undefined, result.learning);
    return nodesById === current.nodesById ? current : { ...current, nodesById };
  });
  if (scope === getCompanionReadingScope()) await ensureCompanionFlowDisplay(result.session);
}
