import { sha256 } from '@noble/hashes/sha2.js';

import { ATTACHMENT_BLOCK_BYTES as BLOCK } from '../../../../../lib/core/sync/attachmentBlockReceiver';
import { attachmentSourceVerification } from '../../../../../lib/core/sync/attachmentSourceVerification';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../../../../lib/core/sync/framedSyncContract';
import { exchangeRequestSyncAttachments } from '../../../../../lib/core/sync/requestSyncAttachmentExchange';
import { exchangeRequestSyncInventory } from '../../../../../lib/core/sync/requestSyncDatabaseExchange';
import type { RequestSyncDatabaseHost } from '../../../../../lib/core/sync/requestSyncObjectEndpoint';
import { withRequestSyncPeerRound } from '../../../../../lib/core/sync/requestSyncPeerRound';
import { FolioleCompanionSync } from '../../companionWorkspaceRuntimeRepository';
import { createCompanionAttachmentHost } from '../sync/framed/companionAttachmentBlockFiles';
import { createCompanionFramedSyncFiles } from '../sync/framed/companionFramedSyncFiles';
import { createCompanionRequestSyncExchange } from '../sync/framed/companionRequestSyncExchange';
import { companionSyncPeerRoundOwner } from '../sync/framed/companionSyncPeerRounds';

import { openAttachmentThroughputFixture, removeThroughputFiles, throughputFile, THROUGHPUT_KEYS } from './attachmentThroughputFixture';
import { companionFramedFileOwner } from './companionFramedPayloadBudget';

export async function runAttachmentThroughputNativeProbe(platform: 'android' | 'ios', endpointUrl: string, progress: (detail: string) => void) {
  progress('Preparing 30000 nodes');
  const keys = THROUGHPUT_KEYS;
  const fixture = await openAttachmentThroughputFixture(platform, keys);
  const identity = companionFramedFileOwner(fixture.owner);
  const db: RequestSyncDatabaseHost = { files: createCompanionFramedSyncFiles(FolioleCompanionSync, identity),
    readSnapshot: read => fixture.owner.readSnapshot(read), write: write => fixture.owner.runWriter(write) };
  const host = await createCompanionAttachmentHost(db, identity);
  try {
    await removeThroughputFiles(keys);
    for (let i = 0; i < 2; i++) {
      progress(`Preparing source file ${i + 1}`);
      const { bytes, key } = throughputFile(i);
      for (let offset = 0; offset < bytes.length; offset += BLOCK) {
        await host.receive({ storageKey: key, byteLength: bytes.length }, offset, bytes.subarray(offset, offset + BLOCK));
      }
    }
    const result = await measure(db, host, endpointUrl, progress);
    for (const key of keys) {
      const info = await FolioleCompanionSync.accessFramedSyncFile({ ...identity, operation: 'attachment', action: 'stat', key });
      if (info.hash !== key.slice(0, 64) || info.length !== 64 * 1024 * 1024) throw new Error('Throughput final hash mismatch');
    }
    return { ...result, finalHashesVerified: 4, nodesPerSide: 30000, totalFixtureBytes: 256 * 1024 * 1024 };
  } finally {
    try { await removeThroughputFiles(keys); } finally { await fixture.close(); }
  }
}

async function measure(db: RequestSyncDatabaseHost, host: Awaited<ReturnType<typeof createCompanionAttachmentHost>>, endpointUrl: string, progress: (detail: string) => void) {
  const ownership = await companionSyncPeerRoundOwner();
  const measurement = measureSource();
  const started = performance.now();
  let rounds = 0, blocks = 0, pending: number | null = 1;
  const phases: object[] = [];
  try {
    while (pending !== 0) {
      progress(`Transferring round ${rounds}, blocks ${blocks}, elapsed ${Math.round(performance.now() - started)} ms; previous ${JSON.stringify(phases.at(-1))}`);
      const id = crypto.randomUUID(), lease = ownership.acquireOutbound('local', id);
      if (!lease) throw new Error('Throughput round unavailable');
      const peerRound = { id, lease, admitted: false };
      const exchange = createCompanionRequestSyncExchange(db, { endpointUrl, peerRound, groupKey: new Uint8Array(32).fill(7),
        context: { protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION, groupId: 'group', initiatorDeviceId: 'peer',
          initiatorLibraryEpoch: 'peer-epoch', responderDeviceId: 'local', responderLibraryEpoch: 'local-epoch' } });
      try {
        await withRequestSyncPeerRound(exchange, peerRound, async () => {
          const began = performance.now();
          if (rounds === 0) await exchangeRequestSyncInventory(db, exchange);
          const inventoryMs = performance.now() - began;
          const attachmentStarted = performance.now();
          const result = await exchangeRequestSyncAttachments(host, exchange, (_key, error) => { throw error; });
          pending = result.pending; blocks += result.blocks;
          phases.push({ round: rounds, inventoryMs, attachmentMs: performance.now() - attachmentStarted, ...result, ...measurement.metrics });
        });
      } finally { lease.release(); }
      if (++rounds > 1000) throw new Error('Throughput did not converge');
    }
    if (blocks !== 512) throw new Error(`Throughput block count differs: ${blocks}`);
    return { elapsedMs: Math.round(performance.now() - started), rounds, blocks, phases, ...measurement.metrics };
  } catch (error) { throw new Error(`Throughput failed after ${rounds} rounds / ${blocks} blocks: ${String(error)}; ${JSON.stringify(measurement.metrics)}`); }
  finally { measurement.close(); }
}

function measureSource() {
  attachmentSourceVerification.invalidate();
  const original = attachmentSourceVerification.verify;
  const metrics = { sourceReadBytes: 0, sourceHashedBytes: 0, sourceHashCalls: 0, sourceFullHashes: 0 };
  attachmentSourceVerification.verify = (identity, file, shouldYield) => original.call(attachmentSourceVerification,
    identity, { ...file, async read(offset, length) {
      const bytes = await file.read(offset, length); metrics.sourceReadBytes += bytes.length; return bytes;
    } }, shouldYield, () => {
      metrics.sourceHashCalls++;
      const digest = sha256.create();
      let size = 0;
      return { update(bytes) { size += bytes.length; metrics.sourceHashedBytes += bytes.length; digest.update(bytes); },
        digest() { if (size > BLOCK) metrics.sourceFullHashes++; return digest.digest(); } };
    });
  return { metrics, close: () => { attachmentSourceVerification.verify = original; attachmentSourceVerification.invalidate(); } };
}
