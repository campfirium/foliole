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
  replaceSnapshot(snapshot: WorkspaceSnapshot, changedNodeId?: string): Promise<unknown>;
}

function stableShareNodeId(deliveryId: string) {
  return `node-share-${deliveryId.toLowerCase()}`;
}

function stableShareVersionId(deliveryId: string) {
  return `ver_share_${deliveryId.toLowerCase()}`;
}

export async function consumeCompanionShareInbox(workspace: ShareInboxWorkspace) {
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
    await workspace.replaceSnapshot(snapshot, result.nodeId);
    await acknowledgeCompanionShare(item.delivery_id);
  }
}

export function listenForCompanionShares(listener: () => void) {
  return FolioleCompanionShareInbox.addListener('shareInboxChanged', listener);
}
