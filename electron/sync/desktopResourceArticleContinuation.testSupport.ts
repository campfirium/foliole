import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';
import { openDatabaseConnection, type DatabaseConnection } from '../database/connection.js';
import { resolveSyncPackPath } from '../database/syncPackBuilderTestSupport.js';

import { seedMixedSource, type BatchPeerIds } from './companionLanMultiNodeBatch.testSupport.js';
import { writeAttachmentFixture } from './desktopAttachmentRanges.http.testSupport.js';

export function openContinuationReceiver(dbPath: string): DatabaseConnection {
  const sqlite = new Database(dbPath);
  return { sqlite, driver: createBetterSqlite3Driver(sqlite), dbPath, searchDbPath: dbPath + '.search' };
}

function seedBody(body: Buffer, hash: string) {
  const source = openDatabaseConnection().driver;
  source.execute(`INSERT INTO content_blobs
    (hash, storage_key, kind, mime_type, compression, original_size_bytes,
      stored_size_bytes, original_sha256, stored_sha256, availability, created_at)
    VALUES (?, ?, 'text_body', 'text/plain', 'none', ?, ?, ?, ?, 'cached', 'now')`,
  [hash, `text/${hash}`, body.length, body.length, hash, hash]);
}

function createReceiver(ids: BatchPeerIds, hash: string, body: Buffer) {
  const receiver = openContinuationReceiver(resolveSyncPackPath('article-receiver.db'));
  const { sqlite } = receiver;
  initializeDatabaseConnection({ sqlite });
  sqlite.prepare('ATTACH DATABASE ? AS src').run(openDatabaseConnection().dbPath);
  try {
    for (const table of ['sync_groups', 'sync_group_devices', 'content_blobs', 'attachments']) {
      sqlite.exec(`INSERT INTO ${table} SELECT * FROM src.${table}`);
    }
  } finally { sqlite.exec('DETACH DATABASE src'); }
  sqlite.prepare("INSERT INTO sync_group_local_state VALUES (1, 'group', ?, 'active', 'now')").run(ids.receiver);
  sqlite.prepare(`INSERT INTO nodes (id, kind, title, content, body_blob_hash, created_at, updated_at)
    VALUES ('article', 'topic', 'Article', '', ?, 'now', 'now')`).run(hash);
  sqlite.prepare(`INSERT INTO node_sync_versions
    (version_id, object_id, parent_version_id, host_name, created_at, content_hash, body_text, snapshot_json)
    VALUES ('article-head', 'article', NULL, 'source', 'now', ?, ?, ?)`).run(hash,
  body.toString('utf8'), JSON.stringify({ id: 'article', content: body.toString('utf8') }));
  sqlite.exec("UPDATE nodes SET current_version_id='article-head', sync_dirty=0 WHERE id='article'");
  sqlite.prepare(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, current_version_id, content_hash, updated_at, sync_dirty,
      last_modified_by_host_name)
    VALUES ('node', 'article', 10, 'article-head', ?, 'now', 0, 'source')`).run(hash);
  sqlite.prepare(`INSERT INTO sync_pack_resource_articles VALUES ('group', ?, 'article')`).run(ids.source);
  return receiver;
}

export async function prepareArticleContinuation(ids: BatchPeerIds) {
  seedMixedSource(ids);
  const sourceAssets = resolveSyncPackPath('source-assets');
  const receiverAssets = resolveSyncPackPath('receiver-assets');
  await fs.mkdir(sourceAssets);
  await fs.mkdir(receiverAssets);
  const first = await writeAttachmentFixture(sourceAssets, 1024);
  const second = await writeAttachmentFixture(sourceAssets, 2048);
  const secondBytes = await fs.readFile(second.sourcePath);
  await fs.rm(second.sourcePath);
  const body = Buffer.from(`![first](asset://${first.hash}.png)\n![second](asset://${second.hash}.png)`);
  const hash = createHash('sha256').update(body).digest('hex');
  seedBody(body, hash);
  for (const [resource, bytes] of [[first, 1024], [second, 2048]] as const) {
    openDatabaseConnection().driver.execute(`INSERT INTO attachments
      (id, original_name, mime_type, size_bytes, created_at) VALUES (?, 'image.png', 'image/png', ?, 'now')`,
    [resource.hash, bytes]);
  }
  const receiver = createReceiver(ids, hash, body);
  return { receiver, receiverAssets, sourceAssets, body, hash, first, second, secondBytes };
}

export function readArticleContinuationState(receiver: DatabaseConnection) {
  const { sqlite } = receiver;
  return {
    pending: sqlite.prepare('SELECT count(*) FROM sync_pack_resource_articles').pluck().get(),
    bodies: sqlite.prepare('SELECT count(*) FROM content_blob_data').pluck().get(),
    version: sqlite.prepare("SELECT current_version_id FROM nodes WHERE id='article'").pluck().get(),
    seq: sqlite.prepare("SELECT state_seq FROM sync_object_state WHERE object_type='node' AND object_id='article'")
      .pluck().get()
  };
}

export function receiverAttachmentPath(assets: string, hash: string) {
  return path.join(assets, `${hash}.png`);
}

export async function writeArticleContinuationEvidence(report: Record<string, unknown>) {
  await fs.mkdir('.tmp/artifacts/T267', { recursive: true });
  await fs.writeFile('.tmp/artifacts/T267/resource-article-authenticated-continuation.json',
    JSON.stringify(report, null, 2));
}
