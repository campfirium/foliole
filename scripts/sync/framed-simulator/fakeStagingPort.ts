import type { AuthenticatedStagedFrame, FramedWireFrame } from './types.js';

export type FakeFramedStagingSnapshot = Readonly<{
  frames: readonly AuthenticatedStagedFrame[];
  invalidated: boolean;
  receipt: Uint8Array | null;
}>;

function sameBytes(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength &&
    left.every((byte, index) => right[index] === byte);
}

function sameWireFrame(left: FramedWireFrame, right: FramedWireFrame) {
  return left.sequence === right.sequence &&
    sameBytes(left.preamble, right.preamble) &&
    sameBytes(left.frameHeader, right.frameHeader) &&
    sameBytes(left.ciphertext, right.ciphertext);
}

function cloneFrame(frame: AuthenticatedStagedFrame): AuthenticatedStagedFrame {
  return {
    ciphertext: frame.ciphertext.slice(),
    frameHeader: frame.frameHeader.slice(),
    plaintext: frame.plaintext.slice(),
    preamble: frame.preamble.slice(),
    sequence: frame.sequence
  };
}

export class FakeFramedStagingPort {
  readonly #frames = new Map<bigint, AuthenticatedStagedFrame>();
  #invalidated = false;
  #receipt: Uint8Array | null = null;

  static restore(snapshot: FakeFramedStagingSnapshot) {
    const port = new FakeFramedStagingPort();
    port.#invalidated = snapshot.invalidated;
    port.#receipt = snapshot.receipt?.slice() ?? null;
    for (const frame of snapshot.frames) port.#frames.set(frame.sequence, cloneFrame(frame));
    return port;
  }

  commitAuthenticatedFrame(frame: AuthenticatedStagedFrame): 'created' | 'identical' {
    if (this.#invalidated) throw new Error('attempt_invalidated');
    const existing = this.#frames.get(frame.sequence);
    if (!existing) {
      this.#frames.set(frame.sequence, cloneFrame(frame));
      return 'created';
    }
    if (!sameWireFrame(existing, frame) || !sameBytes(existing.plaintext, frame.plaintext)) {
      throw new Error('staged_frame_identity_conflict');
    }
    return 'identical';
  }

  commitReceipt(receipt: Uint8Array): 'created' | 'identical' {
    if (this.#invalidated) throw new Error('attempt_invalidated');
    if (!this.#receipt) {
      this.#receipt = receipt.slice();
      return 'created';
    }
    if (!sameBytes(this.#receipt, receipt)) throw new Error('receipt_identity_conflict');
    return 'identical';
  }

  findIdenticalFrame(frame: FramedWireFrame) {
    const existing = this.#frames.get(frame.sequence);
    return existing && sameWireFrame(existing, frame) ? cloneFrame(existing) : null;
  }

  invalidateAttempt() {
    this.#frames.clear();
    this.#invalidated = true;
    this.#receipt = null;
  }

  loadReceipt() {
    return this.#receipt?.slice() ?? null;
  }

  nextExpectedSequence() {
    return BigInt(this.#frames.size);
  }

  snapshot(): FakeFramedStagingSnapshot {
    return {
      frames: this.stagedFrames(),
      invalidated: this.#invalidated,
      receipt: this.#receipt?.slice() ?? null
    };
  }

  stagedFrames() {
    return [...this.#frames.values()]
      .sort((left, right) => left.sequence < right.sequence ? -1 : 1)
      .map(cloneFrame);
  }
}
