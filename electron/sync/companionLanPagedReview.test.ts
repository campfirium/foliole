// @vitest-environment node
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { encodeSyncPackFactClaims } from '../../lib/core/sync/syncPackFactPresence.js';
import { openDatabaseConnection } from '../database/connection.js';
import { insertNodeReviewSyncState, mockedSyncPackBuilderAppDataDir,
  resolveSyncPackPath, setupSyncPackBuilderTestLifecycle } from '../database/syncPackBuilderTestSupport.js';

import { createCompanionFactSession, readCompanionFactSessionPage } from './companionLanFactSession.js';
import { activatePagedCompanionDependencySession } from './companionLanPagedDependencySession.js';
import { buildCompanionSyncPackResource } from './companionLanSyncPack.js';
import { extractSyncPackDatabaseFromFile } from './syncPackContainerReader.js';

vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: mockedSyncPackBuilderAppDataDir,
  app_cache_dir: path.join(mockedSyncPackBuilderAppDataDir, 'cache'),
  app_config_dir: path.join(mockedSyncPackBuilderAppDataDir, 'config'),
  app_log_dir: path.join(mockedSyncPackBuilderAppDataDir, 'logs')
}) }));
vi.mock('../database/syncGroupStore.js', () => ({ loadDesktopSyncGroup: () => ({
  group_id: 'group', local_device_identity_key: 'source',
  devices: [{ device_identity_key: 'source', state: 'active' }]
}) }));
setupSyncPackBuilderTestLifecycle();

it('sends only the missing review event after 260 facts are checked in pages', async () => {
  insertNodeReviewSyncState();
  const source = openDatabaseConnection();
  for (let i = 1; i < 260; i++) {
    const op = `op-${String(i).padStart(4, '0')}`;
    source.driver.execute(`INSERT INTO review_log
      (id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at,
       due_before, stability_before, difficulty_before, due_after, stability_after, difficulty_after)
      VALUES (?, ?, 'source', 'node-review-1', 3, 'ts-fsrs@4', 'now', 'before', 1, 2, 'after', 3, 4)`,
    [`review-${i}`, op]);
  }
  const state = source.driver.queryOne<{ high_water: number; source_epoch: string }>(
    'SELECT high_water, source_epoch FROM sync_state_sequence WHERE singleton_id = 1')!;
  const session = await createCompanionFactSession({ groupId: 'group', toPeerId: 'receiver',
    window: { fromStateSeq: 1, toStateSeq: 6, frontierStateSeq: state.high_water,
      sourceEpoch: state.source_epoch } });
  const viewId = session.view.sourceViewId;
  session.view.close();
  const args = { groupId: 'group', peerId: 'receiver', viewId };
  let page = await readCompanionFactSessionPage(args);
  let reviewCount = 0;
  for (let turn = 0; turn < 8 && 'index' in page; turn++) {
    reviewCount += page.index.reviews.length;
    const claims = { versions: page.index.versions.map((fact) => fact.version_id),
      parents: page.index.parents.map((fact) => JSON.stringify([
        fact.version_id, fact.parent_version_id, fact.ordinal])),
      reviews: page.index.reviews.filter((fact) => fact.op_id !== 'op-0259').map((fact) => fact.op_id) };
    page = await readCompanionFactSessionPage({ ...args,
      previousIndexId: page.index.index_id,
      claimBits: encodeSyncPackFactClaims(page.index, claims) });
  }
  expect(reviewCount).toBe(260);
  expect('ready' in page && page.ready).toBe(true);
  const dependency = await activatePagedCompanionDependencySession({
    groupId: 'group', fromPeerId: 'source', toPeerId: 'receiver', viewId });
  try {
    expect(dependency.transfer.objectType).toBe('node_review');
    expect(dependency.transfer.expectedRows).toBe(1);
  } finally { dependency.view.close(); }
  const url = new URL(`http://localhost/companion/sync-pack?page_contract=bounded-v1&after_state_seq=1&dependency_view=${viewId}`);
  const resource = await buildCompanionSyncPackResource(url, 'receiver');
  try {
    const incoming = resolveSyncPackPath('review-dependency.db');
    await extractSyncPackDatabaseFromFile({ archivePath: resource.filePath!, outputPath: incoming,
      expectedPeerId: 'receiver', expectedSourcePeerId: 'source', maxDatabaseBytes: 4 * 1024 * 1024 });
    const pack = new Database(incoming, { readonly: true });
    try {
      const row = pack.prepare('SELECT row_json FROM sync_pack_dependency_page_rows').get() as { row_json: string };
      expect(JSON.parse(row.row_json)).toMatchObject({ table: 'review_log', key: { key: 'op-0259' } });
    } finally { pack.close(); }
  } finally { await resource.cleanup?.(); }
});
