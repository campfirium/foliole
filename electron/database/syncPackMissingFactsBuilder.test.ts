import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import { retainLocalEditBase, releaseLocalEditBase } from '../../lib/core/sync/nodeVersionLocalEditHold.js';
import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { openDatabaseConnection } from './connection.js';
import { buildDesktopSyncPackFromDriver } from './syncPackBuilder.js';
import {
  insertNodeSyncState,
  insertNodeReviewSyncState,
  mockedSyncPackBuilderAppDataDir,
  readPackRows,
  resolveSyncPackPath,
  setupSyncPackBuilderTestLifecycle
} from './syncPackBuilderTestSupport.js';
import { loadDesktopSyncPackFactIndex } from './syncPackFactIndex.js';
import { DEFAULT_SYNC_PACK_PAGE_BUDGET } from './syncPackPageBudget.js';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedSyncPackBuilderAppDataDir,
    app_cache_dir: path.join(mockedSyncPackBuilderAppDataDir, 'cache'),
    app_config_dir: path.join(mockedSyncPackBuilderAppDataDir, 'config'),
    app_log_dir: path.join(mockedSyncPackBuilderAppDataDir, 'logs')
  })
}));

setupSyncPackBuilderTestLifecycle();

async function seedHeldHistory() {
  insertNodeSyncState();
  const driver = openDatabaseConnection().driver;
  const body = 'b'.repeat(200_000);
  const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite);
  driver.execute(`UPDATE node_sync_versions SET body_text = ?,
    snapshot_json = '{"id":"node-1","content":null}'
    WHERE version_id = 'desktop#node-1-v1'`, [body]);
  for (let index = 2; index <= 24; index += 1) {
    const versionId = `v${index}`;
    const parentId = index === 2 ? 'desktop#node-1-v1' : `v${index - 1}`;
    driver.execute(`INSERT INTO node_sync_versions
      (version_id, object_id, parent_version_id, host_name, created_at,
       content_hash, body_text, snapshot_json)
      VALUES (?, 'node-1', ?, 'desktop', '2026-09-28', ?, ?,
        '{"id":"node-1","content":null}')`, [versionId, parentId, `hash-${index}`, body]);
    driver.execute(`INSERT INTO node_sync_version_parents
      (version_id, parent_version_id, ordinal) VALUES (?, ?, 0)`, [versionId, parentId]);
  }
  const bodyHash = upsertTextBodyBlob(driver, body, '2026-09-28');
  driver.execute(`UPDATE nodes SET current_version_id = 'v24', body_blob_hash = ?, sync_dirty = 0
    WHERE id = 'node-1'`, [bodyHash]);
  driver.execute(`UPDATE sync_object_state SET current_version_id = 'v24', content_hash = 'hash-24', sync_dirty = 0
    WHERE object_type = 'node' AND object_id = 'node-1'`);
  for (const versionId of ['desktop#node-1-v1', ...Array.from({ length: 22 }, (_, index) => `v${index + 2}`)]) {
    await retainLocalEditBase(port, { holdId: `draft-${versionId}`, nodeId: 'node-1', versionId });
  }
  expect(await collectNodeVersionPayloads(port, 'node-1')).toEqual({ released: 0, skipped: null });
  return port;
}

it('packs only the new version when the receiver has the earlier 23 still-held bodies and relations', async () => {
  const port = await seedHeldHistory();
  const driver = openDatabaseConnection().driver;
  const index = loadDesktopSyncPackFactIndex(driver, { fromStateSeq: 0, frontierStateSeq: 1 });
  expect(index.to_state_seq).toBe(1);
  expect(index.versions).toHaveLength(24);
  expect(index.versions[0]?.body_hash).toMatch(/^[a-f0-9]{64}$/u);
  const versions = ['desktop#node-1-v1', ...Array.from({ length: 22 }, (_, index) => `v${index + 2}`)];
  const parents = Array.from({ length: 22 }, (_, index) =>
    JSON.stringify([`v${index + 2}`, index === 0 ? 'desktop#node-1-v1' : `v${index + 1}`, 0]));
  const outputPath = resolveSyncPackPath('missing-facts.syncpack');
  const queriedBodies: string[] = [];
  const queryOne = driver.queryOne.bind(driver);
  const querySpy = vi.spyOn(driver, 'queryOne').mockImplementation((sql, params) => {
    const row = queryOne(sql, params);
    if (row && (typeof row.body_text === 'string' || typeof row.snapshot_json === 'string')) {
      queriedBodies.push(String(row.version_id));
    }
    return row;
  });
  await buildDesktopSyncPackFromDriver({
    fromPeerId: 'source', fromStateSeq: 0, toStateSeq: 1,
    outputPath, packId: 'missing-facts', pageBudget: DEFAULT_SYNC_PACK_PAGE_BUDGET,
    receiverFacts: { versions, parents, reviews: [] }
  }, driver);
  querySpy.mockRestore();
  expect(queriedBodies).toEqual(['v24']);
  const pack = readPackRows(outputPath);
  expect(pack.nodeVersions).toEqual([expect.objectContaining({ version_id: 'v24' })]);
  expect(pack.nodeVersionParents).toEqual([
    { version_id: 'v24', parent_version_id: 'v23', ordinal: 0 }
  ]);
  for (const versionId of versions) await releaseLocalEditBase(port, `draft-${versionId}`, 'node-1');
  expect(driver.queryAll('SELECT version_id, parent_version_id, body_text FROM node_sync_versions WHERE object_id = ?',
    ['node-1'])).toEqual([{ version_id: 'v24', parent_version_id: null, body_text: 'b'.repeat(200_000) }]);
});

it('omits an already held review operation from the transfer', async () => {
  insertNodeReviewSyncState();
  const driver = openDatabaseConnection().driver;
  const index = loadDesktopSyncPackFactIndex(driver, { fromStateSeq: 1 });
  expect(index.reviews.map((review) => review.op_id)).toEqual(['op-1']);
  const outputPath = resolveSyncPackPath('held-review.syncpack');
  await buildDesktopSyncPackFromDriver({
    fromPeerId: 'source', fromStateSeq: 1, toStateSeq: index.to_state_seq,
    outputPath, packId: 'held-review', pageBudget: DEFAULT_SYNC_PACK_PAGE_BUDGET,
    receiverFacts: { versions: [], parents: [], reviews: ['op-1'] }
  }, driver);
  expect(readPackRows(outputPath).reviewLog).toEqual([]);
});

it('refuses to forward a reclaimed version body to a receiver that lacks it', async () => {
  insertNodeSyncState();
  const driver = openDatabaseConnection().driver;
  driver.execute(`UPDATE node_sync_versions SET body_text = NULL,
    snapshot_json = '{"id":"node-1","content":null}'
    WHERE version_id = 'desktop#node-1-v1'`);
  const index = loadDesktopSyncPackFactIndex(driver, { fromStateSeq: 0 });
  expect(index.versions[0]?.body_hash).toBeNull();
  await expect(buildDesktopSyncPackFromDriver({
    fromPeerId: 'relay', fromStateSeq: 0, toStateSeq: 1,
    outputPath: resolveSyncPackPath('reclaimed-relay.syncpack'), packId: 'reclaimed-relay',
    pageBudget: DEFAULT_SYNC_PACK_PAGE_BUDGET,
    receiverFacts: { versions: [], parents: [], reviews: [] }
  }, driver)).rejects.toThrow('sync_pack_fact_body_unavailable:desktop#node-1-v1');
});
