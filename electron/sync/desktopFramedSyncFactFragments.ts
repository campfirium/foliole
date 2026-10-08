import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { FramedSyncFactFragmentDecoder, readFramedSyncFactFrame } from '../../lib/core/sync/framedSyncFactFrameReader.js';
import type { FramedSyncStagingPort } from '../../lib/core/sync/framedSyncStagingPort.js';
import { canonicalFactFromValidatedMessage } from '../../lib/core/sync/framedSyncWireFact.js';

import type { AuthenticatedTransferFrame } from './desktopFramedSyncAuthenticatedTransferFrames.js';
import { collectReplayedParentOrderFact } from './desktopFramedSyncOrderBodyReplay.js';
import { stageDesktopFramedSyncFact } from './desktopFramedSyncProcessInbound.js';
import type { DesktopFramedVerifiedReceiverState } from './desktopFramedSyncVerifiedReceiverState.js';

export async function stageDesktopFramedSyncFactFragment(input: {
  db: DbPort;
  event: AuthenticatedTransferFrame;
  staging: FramedSyncStagingPort;
  state: DesktopFramedVerifiedReceiverState;
}) {
  const { db, event, staging, state } = input;
  if (state.existingReceipt) {
    state.replayedFactFragment ??= new FramedSyncFactFragmentDecoder();
    const decoded = state.replayedFactFragment.accept(event.decoded, event.frame.sequence);
    if (decoded) {
      collectReplayedParentOrderFact(state.facts, event.published, canonicalFactFromValidatedMessage(decoded.message));
      state.replayedFactFragment = null;
    }
    return;
  }
  await staging.commitAuthenticatedFrame(event.frame);
  const completed = state.factFragments.accept(event.decoded, event.frame.sequence);
  if (!completed) return;
  const decoded = await readFramedSyncFactFrame(db, event.frame.transferId, event.frame.attemptId,
    completed.firstSequence.toString(), 'desktop');
  await stageDesktopFramedSyncFact({ frame: event.frame, staging,
    fact: canonicalFactFromValidatedMessage(decoded.message) });
}

export function assertDesktopFramedSyncFactFragmentsComplete(state: DesktopFramedVerifiedReceiverState) {
  state.factFragments.assertComplete();
  if (state.replayedFactFragment) throw new Error('fact_fragment_incomplete');
}
