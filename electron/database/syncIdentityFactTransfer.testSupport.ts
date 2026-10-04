import Database from 'better-sqlite3';

import type { SyncIdentityFactTransfer } from '../../lib/core/sync/syncIdentityFactTransfer.js';
import { readReadySyncIdentityGlobalPage } from '../../lib/core/sync/syncIdentityGlobalRead.js';
import { applySyncIdentityPackWithDbPort } from '../../lib/core/sync/syncIdentityPackApply.js';
import { buildSyncIdentityPackPage } from '../../lib/core/sync/syncIdentityPackPage.js';
import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';
import { extractSyncIdentityPackDatabaseFromFile } from '../sync/syncPackContainerReader.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { openDatabaseConnection } from './connection.js';
import { buildSyncIdentityPackFromDriver } from './syncIdentityPackBuilder.js';
import { createSyncIdentitySourceView } from './syncIdentitySourceView.js';
import { insertNodeSyncState, resolveSyncPackPath } from './syncPackBuilderTestSupport.js';

function seedHistory(reviewCount: number, body?: string) {
  insertNodeSyncState();
  const driver = openDatabaseConnection().driver;
  let parent = 'desktop#node-1-v1';
  for (let index = 0; index < 140; index++) {
    const version = `history-${String(index).padStart(4, '0')}`;
    driver.execute(`INSERT INTO node_sync_versions (version_id, object_id, parent_version_id,
      host_name, created_at, content_hash, snapshot_json) VALUES (?, 'node-1', ?,
      'desktop', '2026-04-27T00:00:00.000Z', 'node-hash', ?)`,
    [version, parent, JSON.stringify({ id: 'node-1', title: 'Node 1', content: 'node body must stay out of pack' })]);
    driver.execute('INSERT INTO node_sync_version_parents VALUES (?, ?, 0)', [version, parent]);
    parent = version;
  }
  driver.execute("UPDATE nodes SET current_version_id = ? WHERE id = 'node-1'", [parent]);
  driver.execute("UPDATE sync_object_state SET current_version_id = ? WHERE object_type = 'node' AND object_id = 'node-1'", [parent]);
  if (body !== undefined) {
    driver.execute("UPDATE node_sync_versions SET body_text = ?, snapshot_json = ? WHERE version_id = ?",
      [body, JSON.stringify({ id: 'node-1', title: 'Node 1', content: body }), parent]);
    driver.execute("UPDATE nodes SET content = ? WHERE id = 'node-1'", [body]);
  }
  for (let index = 0; index < reviewCount; index++) {
    const id = `review-${String(index).padStart(4, '0')}`;
    driver.execute(`INSERT INTO review_log (id, op_id, host_name, node_id, grade, scheduler_version,
      reviewed_at, due_before, stability_before, difficulty_before, due_after, stability_after,
      difficulty_after) VALUES (?, ?, 'desktop', 'node-1', 3, 'ts-fsrs@4',
      '2026-04-27T00:05:00.000Z', '2026-04-27T00:00:00.000Z', 1, 2,
      '2026-04-28T00:00:00.000Z', 3, 4)`, [id, id]);
  }
}

function installGroup() {
  const driver = openDatabaseConnection().driver;
  const identities = ['11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222'].map((anchor, index) =>
    createSyncGroupDeviceIdentity({ group_id: 'group', device_anchor: anchor,
      library_path: index ? '/target' : '/source', path_flavor: 'posix' }));
  const [source, target] = identities;
  if (!source || !target) throw new Error('fixture_identity_missing');
  driver.execute("INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now')");
  driver.execute("INSERT INTO sync_group_local_state VALUES (1, 'group', ?, 'active', 'now')", [source.identity_key]);
  for (const device of identities) {
    driver.execute(`INSERT INTO sync_group_devices (group_id, device_identity_key, device_anchor,
      canonical_library_path, device_name, platform, state, joined_at, updated_at)
      VALUES ('group', ?, ?, ?, 'Fixture', 'mac', 'active', 'now', 'now')`,
    [device.identity_key, device.device_anchor, device.canonical_library_path]);
  }
  return { source, target };
}

export async function createFactTransferFixture(reviewCount = 160, body?: string) {
  seedHistory(reviewCount, body);
  const { source, target } = installGroup();
  const receiverPath = resolveSyncPackPath('fact-receiver.db');
  await openDatabaseConnection().sqlite.backup(receiverPath);
  let receiver = new Database(receiverPath);
  receiver.exec(`DELETE FROM review_log; DELETE FROM node_sync_version_parents;
    DELETE FROM node_sync_versions; DELETE FROM nodes; DELETE FROM sync_object_state WHERE object_type = 'node'`);
  receiver.prepare('UPDATE sync_group_local_state SET local_device_identity_key = ?').run(target.identity_key);
  const view = await createSyncIdentitySourceView(openDatabaseConnection().sqlite, resolveSyncPackPath('fact-source.db'));
  const identity = (await readReadySyncIdentityGlobalPage(view.port, null)).entries.find((row) => row.object_id === 'node-1');
  const fact = view.driver.queryOne<{ digest: string }>("SELECT digest FROM sync_identity_node_facts WHERE node_id = 'node-1'");
  if (!identity || !fact) throw new Error('fixture_fact_missing');
  let pageIndex = 0;
  let previousPageId: string | null = null;
  let attempt = 0;

  async function build(section: SyncIdentityFactTransfer['section'], after: string | null = null,
    chunk?: SyncIdentityFactTransfer['chunk']) {
    const page = buildSyncIdentityPackPage({ group_id: 'group', source_peer_id: source.identity_key,
      target_peer_id: target.identity_key, source_view_id: view.sourceViewId, page_index: pageIndex,
      previous_page_id: previousPageId, objects: [identity!],
      facts: { section, after, limit: 64, digest: fact!.digest, ...(chunk ? { chunk } : {}) } });
    const archivePath = resolveSyncPackPath(`fact-${attempt++}.zip`);
    const built = await buildSyncIdentityPackFromDriver({ page, outputPath: archivePath }, view.driver);
    const extractedPath = resolveSyncPackPath(`fact-${attempt}.db`);
    const manifest = await extractSyncIdentityPackDatabaseFromFile({ archivePath,
      expectedPeerId: target.identity_key, expectedSourcePeerId: source.identity_key, outputPath: extractedPath });
    return { page, manifest, archivePath, extractedPath, measured: built.measured };
  }

  async function apply(pack: Awaited<ReturnType<typeof build>>, mutate?: (database: Database.Database) => void) {
    await extractSyncIdentityPackDatabaseFromFile({ archivePath: pack.archivePath,
      expectedPeerId: target.identity_key, expectedSourcePeerId: source.identity_key,
      outputPath: pack.extractedPath });
    if (mutate) {
      const incoming = new Database(pack.extractedPath);
      try { mutate(incoming); } finally { incoming.close(); }
    }
    const port = createBetterSqliteDbPort(receiver);
    await port.run('ATTACH DATABASE ? AS inc', [pack.extractedPath]);
    try { return await applySyncIdentityPackWithDbPort(port, pack.manifest, { hostName: 'Target' }); }
    finally { await port.run('DETACH DATABASE inc'); }
  }

  async function transfer(section: SyncIdentityFactTransfer['section']) {
    let after: string | null = null;
    let chunk: SyncIdentityFactTransfer['chunk'];
    do {
      const pack = await build(section, after, chunk);
      await apply(pack);
      pageIndex++;
      previousPageId = pack.page.page_id;
      after = pack.manifest.fact_tail?.nextAfter ?? null;
      const tail = pack.manifest.fact_tail?.chunk;
      chunk = tail ? { key: tail.key, offset: tail.nextOffset, total: tail.total } : undefined;
    } while (after !== null || chunk !== undefined);
  }

  return { build, apply, transfer, view, source, target, get receiver() { return receiver; },
    restart() { receiver.close(); receiver = new Database(receiverPath); },
    advance(pack: Awaited<ReturnType<typeof build>>) { pageIndex++; previousPageId = pack.page.page_id; },
    close() { view.close(); receiver.close(); } };
}
