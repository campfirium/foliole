import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { FramedSyncFactFragmentDecoder, readFramedSyncFactFrame } from '../../lib/core/sync/framedSyncFactFrameReader.js';
import type { FramedSyncFilePort } from '../../lib/core/sync/framedSyncFilePort.js';
import { readFramedSyncFileFact } from '../../lib/core/sync/framedSyncFileReadyFacts.js';
import type { FramedSyncStagingPort } from '../../lib/core/sync/framedSyncStagingPort.js';
import { canonicalFactFromValidatedMessage } from '../../lib/core/sync/framedSyncWireFact.js';

import type { AuthenticatedTransferFrame } from './desktopFramedSyncAuthenticatedTransferFrames.js';
import { stageDesktopFramedSyncFact } from './desktopFramedSyncProcessInbound.js';
import type { DesktopFramedVerifiedReceiverState } from './desktopFramedSyncVerifiedReceiverState.js';

export async function stageDesktopFramedSyncFactFragment(input: {
  db: DbPort;
  files?: FramedSyncFilePort;
  event: AuthenticatedTransferFrame;
  staging: FramedSyncStagingPort;
  state: DesktopFramedVerifiedReceiverState;
}) {
  const { db, event, staging, state } = input;
  if (state.existingReceipt) {
    state.replayedFactFragment ??= new FramedSyncFactFragmentDecoder();
    const decoded = state.replayedFactFragment.accept(event.decoded, event.frame.sequence);
    if (decoded) {
      state.replayedFactFragment = null;
    }
    return;
  }
  await staging.commitAuthenticatedFrame(event.frame);
  const completed = state.factFragments.accept(event.decoded, event.frame.sequence);
  if (!completed) return;
  const fact = input.files ? (await readFramedSyncFileFact(input.files, event.frame, completed.firstSequence)).fact :
    canonicalFactFromValidatedMessage((await readFramedSyncFactFrame(db, event.frame.transferId, event.frame.attemptId,
      completed.firstSequence.toString(), 'desktop')).message);
  await stageDesktopFramedSyncFact({ frame: event.frame, staging, fact });
}

export function assertDesktopFramedSyncFactFragmentsComplete(state: DesktopFramedVerifiedReceiverState) {
  state.factFragments.assertComplete();
  if (state.replayedFactFragment) throw new Error('fact_fragment_incomplete');
}
