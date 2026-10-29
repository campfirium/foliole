import type { DailyFlowOpenArgs, DailyFlowResult } from '../../../../../lib/core/flow/dailyFlowContract';
import type { DailyFlowSession } from '../../../../../lib/core/flow/dailyFlowSession';
import { mergeDailyFlowReceiptNodes } from '../../../../store/workspaceDailyFlowReceipt';
import { refreshCompanionWorkspaceAfterMutation } from '../companionWorkspaceRepository';
import { companionWorkspaceSnapshots } from '../companionWorkspaceSnapshotStore';
import { getCompanionReadingScope } from '../reading/companionReadingScope';

import { companionDailyFlowSettings, openCompanionDailyFlow } from './companionDailyFlow';

const readReceiptNodes = new WeakSet<object>();
export function isCompanionReadReceiptSnapshot(nodes: object | undefined) {
  return Boolean(nodes && readReceiptNodes.has(nodes));
}

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
  before: ReturnType<typeof companionWorkspaceSnapshots.getSnapshot>, localRead = false) {
  if (result.session.daily && result.session.daily.scope !== companionDailyFlowSettings().scope) return;
  const scope = getCompanionReadingScope();
  const baseline = companionWorkspaceSnapshots.getSnapshot();
  await companionWorkspaceSnapshots.updateDerived(baseline, current => {
    if (!current || !before || scope !== getCompanionReadingScope()) return current;
    const learning = { ...result.learning };
    for (const value of result.readings ?? []) {
      const node = current.nodesById[value.nodeId];
      if (!node) continue;
      learning[value.nodeId] = { review: node.review, reading: value.reading ? {
        ...value.reading, readingPosition: node.reading?.readingPosition ?? value.reading.readingPosition } : null };
    }
    const nodesById = mergeDailyFlowReceiptNodes(current.nodesById, before.nodesById, undefined, learning);
    if (localRead && nodesById !== current.nodesById) readReceiptNodes.add(nodesById);
    return nodesById === current.nodesById ? current : { ...current, nodesById };
  });
  if (scope === getCompanionReadingScope()) await ensureCompanionFlowDisplay(result.session);
}
