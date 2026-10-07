import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { FRAMED_SYNC_FRAME_TYPES } from '../../lib/core/sync/framedSyncContract.js';
import { decodeFramedSyncPreamble } from '../../lib/core/sync/framedSyncFraming.js';
import type { FramedSyncStagingPort } from '../../lib/core/sync/framedSyncStagingPort.js';
import { createDesktopFramedSyncSessionNoncePort } from '../database/desktopFramedSyncSessionStaging.js';

import type { handleCompanionLanFramedSyncPost } from './companionLanFramedSyncPost.js';
import { respondDesktopFramedSyncInventory } from './desktopFramedSyncInventoryHttp.js';
import { receiveDesktopFramedSyncTransfer, stageDesktopFramedSyncTransfer } from './desktopFramedSyncProcessReceiver.js';
import { receiveDesktopFramedSyncReceipt } from './desktopFramedSyncReceiptReceiver.js';
import { receiveVerifiedDesktopFramedSyncTransfer } from './desktopFramedSyncVerifiedReceiver.js';

type Input = Readonly<{ db: DbPort; groupKey: Uint8Array; groupSecret: string; staging: FramedSyncStagingPort;
  bodyStorage?: 'continuous' | 'chunked' }>;
type StreamInput = Parameters<Parameters<typeof handleCompanionLanFramedSyncPost>[0]['onStream']>[0];

export function createDesktopFramedSyncFixtureReceiver(input: Input) {
  let paused = false;
  return {
    pauseBeforeApply() {
      if (input.bodyStorage === 'chunked') throw new Error('fixture_chunked_pause_unsupported');
      paused = true;
    },
    receive: async ({ context, stream }: StreamInput) => {
      const transferContext = {
        groupId: context.groupId, protocolVersion: context.protocolVersion,
        receiverDeviceId: context.responderDeviceId, receiverLibraryEpoch: context.responderLibraryEpoch,
        senderDeviceId: context.initiatorDeviceId, senderLibraryEpoch: context.initiatorLibraryEpoch
      };
      if (decodeFramedSyncPreamble(stream.preamble).contextKind === 'session') {
        return respondDesktopFramedSyncInventory({ ...input, context, stream,
          noncePort: createDesktopFramedSyncSessionNoncePort(input.db) });
      }
      const inspected = await inspectFixtureStream(stream);
      if (inspected.first.header.frameType === FRAMED_SYNC_FRAME_TYPES.transferReceipt) {
        return receiveDesktopFramedSyncReceipt({ ...input, context: transferContext,
          stream: inspected.stream, transferId: decodeFramedSyncPreamble(stream.preamble).contextId });
      }
      if (paused) {
        await stageDesktopFramedSyncTransfer({ ...input, context: transferContext, stream: inspected.stream });
        throw new Error('fixture_paused_before_apply');
      }
      return input.bodyStorage === 'chunked'
        ? receiveVerifiedDesktopFramedSyncTransfer({ ...input, context: transferContext, stream: inspected.stream })
        : receiveDesktopFramedSyncTransfer({ ...input, context: transferContext, stream: inspected.stream });
    }
  };
}

async function inspectFixtureStream(stream: StreamInput['stream']) {
  const iterator = stream.frames[Symbol.asyncIterator]();
  const next = await iterator.next();
  if (next.done) throw new Error('fixture_frame_required');
  const first = next.value;
  async function* frames() {
    yield first;
    for (;;) {
      const value = await iterator.next();
      if (value.done) return;
      yield value.value;
    }
  }
  return { first, stream: { preamble: stream.preamble, frames: frames() } };
}
