import type {
  FaultedTransport,
  FramedTransportEvent,
  FramedTransportFault,
  FramedWireFrame
} from './types.js';

function cloneFrame(frame: FramedWireFrame): FramedWireFrame {
  return {
    ciphertext: frame.ciphertext.slice(),
    frameHeader: frame.frameHeader.slice(),
    preamble: frame.preamble.slice(),
    sequence: frame.sequence
  };
}

function frameAt(frames: FramedWireFrame[], index: number) {
  const frame = frames[index];
  if (!frame) throw new Error('fault_frame_index_out_of_range');
  return frame;
}

function mutateFrame(frames: FramedWireFrame[], fault: FramedTransportFault) {
  if (fault.kind === 'truncate_frame') {
    const frame = frameAt(frames, fault.frameIndex);
    if (!Number.isSafeInteger(fault.retainedCiphertextBytes) ||
        fault.retainedCiphertextBytes < 0 ||
        fault.retainedCiphertextBytes >= frame.ciphertext.byteLength) {
      throw new Error('truncated_frame_length_invalid');
    }
    frames[fault.frameIndex] = {
      ...frame,
      ciphertext: frame.ciphertext.slice(0, fault.retainedCiphertextBytes)
    };
    return;
  }
  if (fault.kind === 'authentication_failure') {
    const frame = frameAt(frames, fault.frameIndex);
    if (frame.ciphertext.byteLength === 0) throw new Error('authentication_fault_requires_ciphertext');
    const ciphertext = frame.ciphertext.slice();
    ciphertext[ciphertext.byteLength - 1] ^= 0xff;
    frames[fault.frameIndex] = { ...frame, ciphertext };
    return;
  }
  if (fault.kind === 'duplicate_frame') {
    const frame = frameAt(frames, fault.frameIndex);
    frames.splice(fault.frameIndex + 1, 0, cloneFrame(frame));
    return;
  }
  if (fault.kind === 'reorder_frames') {
    const first = frameAt(frames, fault.firstFrameIndex);
    const second = frameAt(frames, fault.secondFrameIndex);
    frames[fault.firstFrameIndex] = second;
    frames[fault.secondFrameIndex] = first;
  }
}

function insertRestarts(
  frames: readonly FramedWireFrame[],
  faults: readonly FramedTransportFault[]
) {
  const restartIndexes = new Set(faults.flatMap((fault) =>
    fault.kind === 'process_restart' ? [fault.afterDeliveryIndex] : []
  ));
  for (const index of restartIndexes) {
    if (!Number.isSafeInteger(index) || index < 0 || index >= frames.length) {
      throw new Error('restart_delivery_index_out_of_range');
    }
  }
  const events: FramedTransportEvent[] = [];
  frames.forEach((frame, index) => {
    events.push({ frame, kind: 'deliver_frame' });
    if (restartIndexes.has(index)) events.push({ kind: 'restart_process' });
  });
  return events;
}

export function applyFramedTransportFaults(args: {
  faults: readonly FramedTransportFault[];
  frames: readonly FramedWireFrame[];
}): FaultedTransport {
  const frames = args.frames.map(cloneFrame);
  for (const fault of args.faults) mutateFrame(frames, fault);
  return {
    ackDelivery: args.faults.some((fault) => fault.kind === 'ack_loss') ? 'drop' : 'deliver',
    events: insertRestarts(frames, args.faults)
  };
}
