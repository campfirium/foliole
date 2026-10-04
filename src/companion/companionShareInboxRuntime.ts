import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { combineNativeCompanionShareParts } from '../../lib/platform/companionShareInboxContract';
import {
  acknowledgeCompanionShare,
  FolioleCompanionShareInbox,
  loadPendingCompanionShares
} from '../shared/platform/companion/shareInbox';

import { persistCompanionCapturedText } from './companionCaptureTextActions';

interface ShareInboxWorkspace {
  bootstrapState: { device_id: string };
  state: { workspace_snapshot: WorkspaceSnapshot | null };
  refreshAfterMutation(snapshot: WorkspaceSnapshot): Promise<unknown>;
}

function stableShareNodeId(deliveryId: string) {
  return `node-share-${deliveryId.toLowerCase()}`;
}

function stableShareVersionId(deliveryId: string) {
  return `ver_share_${deliveryId.toLowerCase()}`;
}

export async function consumeCompanionShareInbox(workspace: ShareInboxWorkspace) {
  // Android product decision (2026-10-04): save valid shares without secondary confirmation.
  // The public entry cannot prove a Sharesheet selection; unsolicited content from another
  // installed app is an accepted quick-capture tradeoff. Do not add confirmation solely
  // for this exposure. Keep payload validation, collision checks and resource limits;
  // reassess the decision if evidence establishes broader impact.
  let snapshot = workspace.state.workspace_snapshot;
  for (const item of await loadPendingCompanionShares()) {
    const text = combineNativeCompanionShareParts(item.parts);
    const result = await persistCompanionCapturedText({
      deviceId: workspace.bootstrapState.device_id,
      nodeId: stableShareNodeId(item.delivery_id),
      now: item.received_at,
      preserveBoundaryWhitespace: true,
      snapshot,
      text,
      versionId: stableShareVersionId(item.delivery_id)
    });
    snapshot = result.snapshot;
    await workspace.refreshAfterMutation(snapshot);
    await acknowledgeCompanionShare(item.delivery_id);
  }
}

export function listenForCompanionShares(listener: () => void) {
  return FolioleCompanionShareInbox.addListener('shareInboxChanged', listener);
}
