// @vitest-environment node
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { textDevice } from '../../../electron/database/topicTextState.testSupport.js';
import { createDesktopFramedSyncFiles } from '../../../electron/sync/desktopFramedSyncFiles.js';

import { FRAMED_SYNC_PROTOCOL_VERSION } from './framedSyncContract.js';
import { compareFramedSyncDatabaseInventories } from './framedSyncDatabaseDifference.js';
import { decodeFrameHeader } from './framedSyncFraming.js';
import { flushRequestSyncInventoryDigests } from './framedSyncInventoryDigest.js';
import { readFramedSyncInventory } from './framedSyncInventoryRead.js';
import { exchangeRequestSyncInventory, type RequestSyncExchange } from './requestSyncDatabaseExchange.js';
import { respondRequestSyncDatabase } from './requestSyncDatabaseResponse.js';
import type { RequestSyncDatabaseHost } from './requestSyncObjectEndpoint.js';
import type { RequestSyncWireFrame } from './requestSyncWire.js';

it('keeps one-change wire volume bounded at both fixed library scales using narrow SQLite reads', { meta: { calibratedMs: 60_000 } }, async () => {
  const evidence = [];
  for (const count of [5150, 35000]) {
    const left = textDevice();
    const right = textDevice();
    const root = await mkdtemp(path.join(os.tmpdir(), 'bucket-scale-'));
    try {
      for (const device of [left, right]) {
        seedScale(device, count);
        await device.db.transaction(flushRequestSyncInventoryDigests);
      }
      right.sqlite.prepare(`UPDATE framed_sync_inventory SET content_hash = ?, frontier_json = '["v2"]' WHERE object_id = 'node-000000'`).run(JSON.stringify(['2'.repeat(64), 'v2', []]));
      const files = createDesktopFramedSyncFiles(root);
      const host = (device: typeof left): RequestSyncDatabaseHost => ({ files,
        write: task => task(device.db), readSnapshot: task => device.db.transaction(task) });
      let bytes = 0;
      let frames = 0;
      const query = vi.spyOn(left.db, 'query');
      const context = { groupId: 'test', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
        initiatorDeviceId: 'a', initiatorLibraryEpoch: 'a', responderDeviceId: 'b', responderLibraryEpoch: 'b' } as const;
      const counted = async function* (input: AsyncIterable<RequestSyncWireFrame>) {
        for await (const frame of input) { bytes += frame.headerBytes.length + frame.ciphertext.length; frames += 1; yield { ...frame, header: decodeFrameHeader(frame.headerBytes) }; }
      };
      const exchange: RequestSyncExchange = { context, groupKey: new Uint8Array(32).fill(3),
        request: async (_path, body, consume) => respondRequestSyncDatabase(host(right), {
          context, groupKey: new Uint8Array(32).fill(3), mode: 'inventory',
          stream: { preamble: body.preamble, frames: counted(body.frames) }
        }, response => consume({ preamble: response.preamble, frames: counted(response.frames) })) };
      const started = performance.now();
      const inventories = await exchangeRequestSyncInventory(host(left), exchange);
      const elapsedMs = performance.now() - started;
      const queries = query.mock.calls.length;
      const differences = compareFramedSyncDatabaseInventories(inventories);
      const normalize = (values: typeof differences) => values.map(value => ({ ...value, sourceSnapshot: {
        ...value.sourceSnapshot, currentVersionId: value.sourceSnapshot.currentVersionId ?? '',
        unready: value.sourceSnapshot.unready ?? false
      } }));
      expect(normalize(differences)).toEqual(normalize(compareFramedSyncDatabaseInventories({
        local: await readFramedSyncInventory(left.db), remote: await readFramedSyncInventory(right.db)
      })));
      expect(differences).toHaveLength(2);
      expect(bytes).toBeLessThan(50000);
      expect(frames).toBeLessThan(20);
      expect(queries).toBeLessThan(25);
      evidence.push({ count, bytes, frames, queries, elapsedMs });
    } finally { left.sqlite.close(); right.sqlite.close(); await rm(root, { recursive: true, force: true }); }
  }
  await mkdir('.tmp/artifacts/t357', { recursive: true });
  await writeFile('.tmp/artifacts/t357/bucket-scale.json', JSON.stringify(evidence, null, 2));
});

function seedScale(device: ReturnType<typeof textDevice>, count: number) {
  const nodes = count === 35000 ? 30000 : count;
  const insert = device.sqlite.prepare(`INSERT INTO framed_sync_inventory VALUES
    ('node', ?, ?, '["v1"]', '[]', '[]', '[]', '[]')`);
  const document = device.sqlite.prepare(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, deleted_at)
    VALUES ('external_document', ?, ?, ?, 'fixture', '2026-10-16', NULL)`);
  const body = device.sqlite.prepare(`INSERT INTO external_documents
    (document_id, folder_id, relative_path, file_name, extension, source_size_bytes, source_modified_at,
     source_modified_ms, content_hash, title, content, body_blob_hash, indexed_at, created_at, updated_at)
    VALUES (?, 'fixture', ?, 'test.md', 'md', 4, '2026-10-16', 0, ?, 'Document', 'body', ?, 'now', 'now', 'now')`);
  device.sqlite.transaction(() => {
    for (let index = 0; index < nodes; index++) {
      insert.run(`node-${String(index).padStart(6, '0')}`, JSON.stringify(['1'.repeat(64), 'v1', []]));
    }
    for (let index = nodes; index < count; index++) {
      body.run(`document-${index}`, `${index}.md`, '3'.repeat(64), '4'.repeat(64));
      document.run(`document-${index}`, index + 1, '3'.repeat(64));
    }
  })();
}
