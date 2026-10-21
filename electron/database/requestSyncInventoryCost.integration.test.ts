// @vitest-environment node
import { mkdir, writeFile } from 'node:fs/promises';

import { expect, it } from 'vitest';

import { summarizeInventoryBuckets } from '../../lib/core/sync/framedSyncInventoryBuckets.js';
import { expandRequestSyncNodeSummaries, flushRequestSyncInventoryDigests, readRequestSyncInventorySummaries } from '../../lib/core/sync/framedSyncInventoryDigest.js';
import { encodeValidatedProtocolMessage } from '../../lib/core/sync/framedSyncProtocolCodec.js';
import { iterateRequestSyncInventory } from '../../lib/core/sync/requestSyncInventoryWire.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';

import { textBranch, textDevice } from './topicTextState.testSupport.js';

it('measures digest preparation, full summary reads and hashing for 10000 persisted nodes', { meta: { calibratedMs: 120000 } }, async () => {
  const host = textDevice();
  try {
    const records = Array.from({ length: 10000 }, (_, index) => {
      const id = `node-${index}`;
      const record = textBranch(`version-${index}`, `Body ${index}`);
      return { ...record, object_id: id, snapshot: { ...record.snapshot, id } };
    });
    await applyConvergentSyncNodesWithDbPort(host.db, records);
    expect(host.sqlite.prepare('SELECT count(*) FROM nodes').pluck().get()).toBe(10000);
    const samples = [];
    for (const profile of ['unchanged', 'single-change', 'hot-and-other-bucket']) {
      for (let sample = 0; sample < 3; sample++) {
        if (profile !== 'unchanged') {
          for (const index of profile === 'single-change' ? [0] : [0, 9999]) {
            const previous = records[index]!;
            const next = textBranch(`${profile}-${sample}-${index}`, `Changed ${sample}`, previous);
            records[index] = { ...next, object_id: previous.object_id,
              snapshot: { ...next.snapshot, id: previous.object_id } };
            await applyConvergentSyncNodesWithDbPort(host.db, [records[index]!]);
          }
        }
        samples.push({ profile, sample, ...await measure(host) });
      }
    }
    await mkdir('.tmp/artifacts/t360', { recursive: true });
    await writeFile('.tmp/artifacts/t360/inventory-cost.json', JSON.stringify({
      nodeCount: 10000, storage: 'in-memory SQLite, production facts and projections',
      samples,
      excludes: ['disk I/O', 'network', 'mobile runtime', 'HTTP and encryption overhead']
    }, null, 2));
  } finally { host.sqlite.close(); }
});

async function measure(host: ReturnType<typeof textDevice>) {
  const measurements: Record<string, number> = {};
  async function timed<T>(name: string, work: () => T | Promise<T>) {
    const start = performance.now();
    const result = await work();
    measurements[name] = performance.now() - start;
    return result;
  }
    await timed('dirtyFlushMs', () => host.db.transaction(flushRequestSyncInventoryDigests));
    await timed('warmFlushMs', () => host.db.transaction(flushRequestSyncInventoryDigests));
    const entries = await timed('readSummariesMs', () => host.db.transaction(readRequestSyncInventorySummaries));
    expect(entries.filter(entry => entry.objectType === 'node')).toHaveLength(10000);
    const summary = await timed('bucketHashMs', () => summarizeInventoryBuckets(entries));
    const messages = await timed('encodeSummaryMs', () => [...iterateRequestSyncInventory({
      entries: [], roundId: new Uint8Array(16), bucketSummary: true,
      bucketHashes: summary.hashes, unreadyBuckets: summary.unready
    })].map(message => encodeValidatedProtocolMessage(message.payloadCase, message.payload)));
    expect(summary.hashes).toHaveLength(32768);
    await timed('oneNodeDetailMs', () => host.db.transaction(db =>
      expandRequestSyncNodeSummaries(db, entries, ['node-0'])));
  return { measurements, protobufBytes: messages.reduce((sum, bytes) => sum + bytes.length, 0) };
}
