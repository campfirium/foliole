import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { assertTextBodyWithinBudget, TextBodyTooLargeError } from '../../lib/core/nodes/textBodyBudget';
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
  refreshAfterMutation(snapshot?: WorkspaceSnapshot): Promise<unknown>;
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
  let blankAcknowledgementFailure: { error: unknown } | undefined;
  let snapshot = workspace.state.workspace_snapshot;
  let oversizedShare: TextBodyTooLargeError | undefined;
  for (const item of await loadPendingCompanionShares()) {
    const text = combineNativeCompanionShareParts(item.parts);
    if (!text) {
      // Older hosts could queue text that trims to empty. Retry failed acknowledgements
      // without holding up valid deliveries.
      try {
        await acknowledgeCompanionShare(item.delivery_id);
      } catch (error) {
        blankAcknowledgementFailure ??= { error };
      }
      continue;
    }
    try {
      assertTextBodyWithinBudget(text);
    } catch (error) {
      if (!(error instanceof TextBodyTooLargeError)) throw error;
      // Leave the original native delivery intact and report the limit after draining valid shares.
      oversizedShare ??= error;
      continue;
    }
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
    // A native delivery published its topic, so the refresh merges it instead of rereading the library.
    await workspace.refreshAfterMutation(result.published ? undefined : snapshot);
    await acknowledgeCompanionShare(item.delivery_id);
  }
  if (oversizedShare) throw oversizedShare;
  if (blankAcknowledgementFailure) throw blankAcknowledgementFailure.error;
}

export function listenForCompanionShares(listener: () => void) {
  return FolioleCompanionShareInbox.addListener('shareInboxChanged', listener);
}
