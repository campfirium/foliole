import { receiveFramedSyncFrame } from '../../../lib/core/sync/framedSyncReceiver.js';

import { FakeFramedStagingPort } from './fakeStagingPort.js';
import { applyFramedTransportFaults } from './faults.js';
import type {
  FramedTransportCounts,
  FramedTransportFault,
  FramedTransportResult,
  FramedWireFrame
} from './types.js';

type MutableCounts = {
  -readonly [Key in keyof FramedTransportCounts]: FramedTransportCounts[Key]
};

function emptyCounts(): MutableCounts {
  return {
    authenticatedFrames: 0,
    deliveryAttempts: 0,
    duplicateFrames: 0,
    rejectedFrames: 0,
    receiptCommits: 0,
    receiptReplays: 0,
    restarts: 0,
    stagedFrames: 0
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'unknown_transport_error';
}

async function deliverFrame(args: {
  counts: MutableCounts;
  frame: FramedWireFrame;
  key: Uint8Array;
  port: FakeFramedStagingPort;
}) {
  args.counts.deliveryAttempts += 1;
  const replay = args.port.findIdenticalFrame(args.frame);
  if (replay) {
    if (args.port.commitAuthenticatedFrame(replay) !== 'identical') {
      throw new Error('duplicate_frame_was_not_idempotent');
    }
    args.counts.duplicateFrames += 1;
    return;
  }
  const received = await receiveFramedSyncFrame({
    ciphertext: args.frame.ciphertext,
    expectedSequence: args.port.nextExpectedSequence(),
    frameHeader: args.frame.frameHeader,
    key: args.key,
    preamble: args.frame.preamble
  });
  args.counts.authenticatedFrames += 1;
  const committed = args.port.commitAuthenticatedFrame({
    ...args.frame,
    plaintext: received.plaintext
  });
  if (committed === 'created') args.counts.stagedFrames += 1;
}

export async function runFramedTransportSimulation(args: {
  faults?: readonly FramedTransportFault[];
  frames: readonly FramedWireFrame[];
  key: Uint8Array;
  receipt?: Uint8Array;
}): Promise<FramedTransportResult> {
  const transport = applyFramedTransportFaults({
    faults: args.faults ?? [],
    frames: args.frames
  });
  const counts = emptyCounts();
  let port = new FakeFramedStagingPort();
  for (const event of transport.events) {
    if (event.kind === 'restart_process') {
      port = FakeFramedStagingPort.restore(port.snapshot());
      counts.restarts += 1;
      continue;
    }
    try {
      await deliverFrame({ counts, frame: event.frame, key: args.key, port });
    } catch (error) {
      counts.rejectedFrames += 1;
      port.invalidateAttempt();
      return result(port, counts, false, errorMessage(error));
    }
  }
  const receipt = args.receipt ?? Uint8Array.of(1);
  port.commitReceipt(receipt);
  counts.receiptCommits += 1;
  if (transport.ackDelivery === 'drop') {
    if (port.commitReceipt(receipt) !== 'identical') {
      throw new Error('receipt_replay_was_not_idempotent');
    }
    counts.receiptReplays += 1;
  }
  return result(port, counts, transport.ackDelivery === 'deliver', null);
}

function result(
  port: FakeFramedStagingPort,
  counts: FramedTransportCounts,
  ackDelivered: boolean,
  error: string | null
): FramedTransportResult {
  return {
    ackDelivered,
    counts: { ...counts },
    error,
    receiptCommitted: port.loadReceipt() !== null,
    stagedSequences: port.stagedFrames().map((frame) => frame.sequence)
  };
}
