// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import { advanceSyncPackDependencyDigest, SYNC_PACK_DEPENDENCY_INITIAL_DIGEST,
  type SyncPackDependencyRow } from '../../lib/core/sync/syncPackDependencyTransfer.js';

import { buildSyncPackDependencyPageArchive } from './syncPackDependencyPageBuilder.js';
import { DEFAULT_SYNC_PACK_PAGE_BUDGET } from './syncPackPageBudget.js';

it('fits a low-compression 741 KiB version body within the authenticated page budget', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-dependency-row-budget-'));
  try {
    const body = Buffer.alloc(741 * 1024);
    let seed = 0x12345678;
    for (let index = 0; index < body.length; index++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      body[index] = 32 + ((seed >>> 16) % 95);
    }
    const row: SyncPackDependencyRow = { table: 'node_sync_versions',
      key: { key: 'v1', ordinal: -1 }, json: JSON.stringify({
        version_id: 'v1', object_id: 'article', parent_version_id: null,
        host_name: 'source', content_hash: 'hash', created_at: 'now',
        body_text: body.toString('utf8'), snapshot_json: '{"id":"article","content":null}'
      }) };
    const digest = advanceSyncPackDependencyDigest(SYNC_PACK_DEPENDENCY_INITIAL_DIGEST, row);
    const outputPath = path.join(root, 'page.syncpack');
    await buildSyncPackDependencyPageArchive({
      page: { transfer: { groupId: 'group', peerId: 'source', sourceEpoch: 'epoch',
        sourceViewId: 'view', objectType: 'node', objectId: 'article', fromStateSeq: 0,
        objectStateSeq: 1, frontierStateSeq: 1, expectedRows: 1, expectedDigest: digest },
      afterRow: 0, beforeDigest: SYNC_PACK_DEPENDENCY_INITIAL_DIGEST,
      afterDigest: digest, rows: [row] },
      outputPath, packId: 'pack', fromPeerId: 'source', toPeerId: 'receiver'
    });
    const archiveBytes = (await fs.stat(outputPath)).size;
    expect(Math.ceil((archiveBytes + 16) / 3) * 4 + 512)
      .toBeLessThanOrEqual(DEFAULT_SYNC_PACK_PAGE_BUDGET.transferBytes);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
