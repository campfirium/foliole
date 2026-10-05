import { describe, expect, it } from 'vitest';

import { FRAMED_SYNC_FRAME_TYPES } from '../../../lib/core/sync/framedSyncContract.js';
import { encryptFrame } from '../../../lib/core/sync/framedSyncCrypto.js';
import {
  encodeFrameHeader,
  encodeFramedSyncPreamble,
  frameAad,
  frameNonce
} from '../../../lib/core/sync/framedSyncFraming.js';

import {
  FRAMED_SIMULATOR_ITEM_COUNTS,
  measureFramedSimulatorCosts
} from './costMeasurement.js';
import { runFramedTransportSimulation } from './simulator.js';

const key = new Uint8Array(32).fill(0x11);
const noncePrefix = Uint8Array.from([1, 2, 3, 4]);

async function makeFrames(count) {
  const preamble = encodeFramedSyncPreamble({
    attemptId: new Uint8Array(16).fill(0x22),
    compression: 'none',
    contextId: new Uint8Array(32).fill(0x33),
    contextKind: 'transfer',
    noncePrefix,
    startingSequence: 0n
  });
  const frames = [];
  for (let index = 0; index < count; index += 1) {
    const sequence = BigInt(index);
    const plaintext = Uint8Array.of(index + 1);
    const frameHeader = encodeFrameHeader({
      ciphertextBytes: plaintext.byteLength + 16,
      flags: 0,
      frameType: FRAMED_SYNC_FRAME_TYPES.fact,
      sequence
    });
    const ciphertext = await encryptFrame({
      aad: frameAad(preamble, frameHeader),
      key,
      nonce: frameNonce(noncePrefix, sequence),
      plaintext
    });
    frames.push({ ciphertext, frameHeader, preamble, sequence });
  }
  return frames;
}

describe('framed transport fault simulation', () => {
  it.each([
    { frameIndex: 0, kind: 'truncate_frame', retainedCiphertextBytes: 1 },
    { firstFrameIndex: 0, kind: 'reorder_frames', secondFrameIndex: 1 },
    { frameIndex: 1, kind: 'authentication_failure' }
  ])('rejects the damaged attempt and clears staged frames for %j', async (fault) => {
    const result = await runFramedTransportSimulation({
      faults: [fault],
      frames: await makeFrames(3),
      key
    });
    expect(result.error).not.toBeNull();
    expect(result.counts.rejectedFrames).toBe(1);
    expect(result.stagedSequences).toEqual([]);
    expect(result.receiptCommitted).toBe(false);
  });

  it('accepts an identical repeated frame once and survives a process restart', async () => {
    const result = await runFramedTransportSimulation({
      faults: [
        { frameIndex: 0, kind: 'duplicate_frame' },
        { afterDeliveryIndex: 1, kind: 'process_restart' }
      ],
      frames: await makeFrames(3),
      key
    });
    expect(result.error).toBeNull();
    expect(result.stagedSequences).toEqual([0n, 1n, 2n]);
    expect(result.counts).toMatchObject({
      authenticatedFrames: 3,
      deliveryAttempts: 4,
      duplicateFrames: 1,
      restarts: 1,
      stagedFrames: 3
    });
  });

  it('keeps the receipt committed when its acknowledgement is lost', async () => {
    const result = await runFramedTransportSimulation({
      faults: [{ kind: 'ack_loss' }],
      frames: await makeFrames(2),
      key,
      receipt: Uint8Array.of(7, 8, 9)
    });
    expect(result.error).toBeNull();
    expect(result.receiptCommitted).toBe(true);
    expect(result.ackDelivered).toBe(false);
    expect(result.counts.receiptCommits).toBe(1);
    expect(result.counts.receiptReplays).toBe(1);
  });
});

class SequenceRssSampler {
  #index = 0;

  constructor(samples) {
    this.samples = samples;
  }

  sampleBytes() {
    const sample = this.samples[this.#index];
    if (sample === undefined) throw new Error('test_rss_sample_missing');
    this.#index += 1;
    return sample;
  }
}

describe('framed simulator cost measurement', () => {
  it('reports stage counts and process RSS samples at every required scale', async () => {
    const samples = await measureFramedSimulatorCosts({
      rssSampler: new SequenceRssSampler([100, 130, 120, 200, 260, 250, 300, 390, 360]),
      run: async ({ increment, itemCount, sampleRss }) => {
        increment('framed', itemCount);
        increment('authenticated', itemCount);
        increment('staged', itemCount);
        increment('applied', itemCount);
        increment('receipt_committed');
        sampleRss();
      }
    });
    expect(samples.map((sample) => sample.itemCount)).toEqual(FRAMED_SIMULATOR_ITEM_COUNTS);
    expect(samples.map((sample) => sample.stageCounts.staged)).toEqual([300, 1_000, 10_000]);
    expect(samples.map((sample) => sample.stageCounts.receipt_committed)).toEqual([1, 1, 1]);
    expect(samples.map((sample) => sample.peakRssBytes)).toEqual([130, 260, 390]);
    expect(samples.map((sample) => sample.rssDeltaBytes)).toEqual([20, 50, 60]);
  });
});
