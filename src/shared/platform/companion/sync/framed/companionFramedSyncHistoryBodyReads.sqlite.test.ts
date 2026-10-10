// @vitest-environment node
import { expect, it } from 'vitest';

import { textBranch, textDevice } from '../../../../../../electron/database/topicTextState.testSupport.js';
import { verifiedCompanionFixture, type Kind } from '../../../../../../electron/sync/companionFramedSyncVerifiedApply.testSupport.js';
import type { DbParams, DbPort, DbRow } from '../../../../../../lib/core/sync/dbPort.js';
import { canonicalContentId } from '../../../../../../lib/core/sync/framedSyncCanonicalManifest.js';
import { projectFramedSyncNodeRecord } from '../../../../../../lib/core/sync/framedSyncNodeProjection.js';
import { encodeValidatedProtocolMessage } from '../../../../../../lib/core/sync/framedSyncProtocolCodec.js';
import { factToWire } from '../../../../../../lib/core/sync/framedSyncWireProjection.js';
import { applySyncNodesWithDbPort } from '../../../../../../lib/core/sync/syncNodeApplyExecutor.js';
import type { NativeSyncNodeRecord } from '../../../../../../lib/platform/nativeSyncContract.js';

import { applyVerifiedCompanionFramedSyncTransfers } from './companionFramedSyncVerifiedApply.js';

const bodyBytes = 1048533;
const versionCount = 15;

function history() {
  const records: NativeSyncNodeRecord[] = [];
  for (let index = 0; index < versionCount; index++) {
    const prefix = `Version ${index}: \uFEFF中😀\0\r\n`;
    const body = prefix + 'x'.repeat(bodyBytes - Buffer.byteLength(prefix));
    records.push(textBranch(`history-${index}`, body, records.at(-1),
      new Date(Date.UTC(2026, 9, 10, 0, 0, index)).toISOString()));
  }
  return records;
}

async function fixture(kind: Kind) {
  const host = await verifiedCompanionFixture(kind, 'Unused');
  const records = history();
  const projections = records.map(record => projectFramedSyncNodeRecord(record));
  const manifest = { facts: projections.flatMap(projection => projection.manifest.facts),
    blobs: projections.flatMap(projection => projection.manifest.blobs) };
  const contentId = await canonicalContentId(manifest);
  const { native, prefix, input } = host;
  native.exec(`DELETE FROM ${prefix}_frames; DELETE FROM ${prefix}_blob_pins; DELETE FROM ${prefix}_available_blobs`);
  native.prepare(`UPDATE ${prefix}_transfers SET content_id = ?, fact_count = ?, blob_count = ?, total_blob_bytes = ?`)
    .run(contentId, versionCount, versionCount, versionCount * bodyBytes);
  for (const [index, projection] of projections.entries()) {
    const descriptor = projection.manifest.blobs[0]!;
    native.prepare(`INSERT INTO ${prefix}_frames VALUES (?, ?, ?, 3, ?, ?, ?, ?)`)
      .run(input.transferId, new Uint8Array(16).fill(1), String(index), new Uint8Array(96),
        new Uint8Array(16), Uint8Array.of(1), encodeValidatedProtocolMessage('fact', factToWire(projection.manifest.facts[0]!)));
    native.prepare(`INSERT INTO ${prefix}_available_blobs VALUES (?, ?, ?)`)
      .run(descriptor.sha256, bodyBytes, projection.bodyBlob);
    native.prepare(`INSERT INTO ${prefix}_blob_pins VALUES (?, ?, ?, 1, 1)`)
      .run(input.transferId, descriptor.sha256, bodyBytes);
  }
  return { host, records, projections };
}

function observeBodyReads(port: DbPort, reads: { bytes: number }): DbPort {
  return { ...port, async query<T extends DbRow>(sql: string, params: DbParams = []) {
    const rows = await port.query<T>(sql, params);
    if (sql.includes('SELECT data, byte_length, typeof(data)')) {
      for (const row of rows) if (row.data instanceof Uint8Array) reads.bytes += row.data.byteLength;
    }
    return rows;
  }, transaction: run => port.transaction(tx => run(observeBodyReads(tx, reads))) };
}

function storedVersions(host: Awaited<ReturnType<typeof verifiedCompanionFixture>>) {
  return host.main.prepare('SELECT version_id, body_text FROM node_sync_versions ORDER BY version_id').all();
}

it.each(['android', 'ios'] as const)('applies %s large history with bounded body I/O and preserves every version after reopening', async kind => {
  const { host, records } = await fixture(kind);
  const sender = textDevice();
  try {
    await applySyncNodesWithDbPort(sender.db, records);
    const reads = { bytes: 0 };
    const receipts = await applyVerifiedCompanionFramedSyncTransfers(observeBodyReads(host.port(), reads), [host.input]);
    expect(reads.bytes).toBeLessThanOrEqual((versionCount + 1) * bodyBytes);
    expect(receipts).toHaveLength(1);
    const expected = sender.sqlite.prepare('SELECT version_id, body_text FROM node_sync_versions ORDER BY version_id').all();
    expect(storedVersions(host)).toEqual(expected);
    host.reopen();
    expect(storedVersions(host)).toEqual(expected);
    expect(host.main.prepare('SELECT content, current_version_id FROM nodes').all())
      .toEqual([{ content: records.at(-1)!.body_text, current_version_id: records.at(-1)!.version_id }]);
    expect(host.main.prepare('SELECT count(*) FROM framed_sync_receipts').pluck().get()).toBe(1);
    expect(await applyVerifiedCompanionFramedSyncTransfers(host.port(), [host.input])).toEqual(receipts);
  } finally { sender.sqlite.close(); host.close(); }
});

it.each(['android', 'ios'] as const)('rolls back %s earlier history on a corrupt later body and retries the durable ready input', async kind => {
  const { host, records, projections } = await fixture(kind);
  try {
    const last = projections.at(-1)!;
    const hash = last.manifest.blobs[0]!.sha256;
    host.native.prepare(`UPDATE ${host.prefix}_available_blobs SET data = ? WHERE sha256 = ?`)
      .run(new Uint8Array(bodyBytes).fill(120), hash);
    await expect(applyVerifiedCompanionFramedSyncTransfers(host.port(), [host.input]))
      .rejects.toThrow('framed_sync_published_body_unavailable');
    expect(storedVersions(host)).toEqual([]);
    expect(host.main.prepare('SELECT count(*) FROM nodes').pluck().get()).toBe(0);
    expect(host.main.prepare('SELECT count(*) FROM framed_sync_receipts').pluck().get()).toBe(0);
    host.reopen();
    host.native.prepare(`UPDATE ${host.prefix}_available_blobs SET data = ? WHERE sha256 = ?`).run(last.bodyBlob, hash);
    const receipts = await applyVerifiedCompanionFramedSyncTransfers(host.port(), [host.input]);
    expect(receipts).toHaveLength(1);
    host.reopen();
    expect(storedVersions(host)).toEqual(records.map(record => ({ version_id: record.version_id,
      body_text: record.body_text })).sort((left, right) => left.version_id!.localeCompare(right.version_id!)));
    expect(host.main.prepare('SELECT count(*) FROM framed_sync_receipts').pluck().get()).toBe(1);
  } finally { host.close(); }
});
