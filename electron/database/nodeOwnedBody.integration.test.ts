// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { loadCompanionWorkspaceNodeFromDb } from '../../lib/core/database/companionWorkspaceNodeRead.js';
import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { loadNodeBodyResolution } from '../../lib/core/database/nodeBodyResolution.js';
import { projectNodeInlineContent } from '../../lib/core/database/nodeInlineProjection.js';
import { loadWorkspaceNodeDocument } from '../../lib/core/database/workspaceNodeDocument.js';
import { loadNodeOwnedArticleResourceNeeds } from '../../lib/core/sync/nodeOwnedArticleResourceNeeds.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { textBranch, textDevice } from './topicTextState.testSupport.js';

const devices: ReturnType<typeof textDevice>[] = [];
afterEach(() => devices.splice(0).forEach((device) => device.sqlite.close()));
const content = '---\r\ntitle: Body\r\n---\r\n\ufeff完整正文😀\u0000end';

async function fixture() {
  const host = textDevice();
  devices.push(host);
  const record = textBranch('original', content);
  await host.receive([record]);
  return { host, record, driver: createBetterSqlite3Driver(host.sqlite) };
}

it('stores exact current text on its node and reads it through desktop and companion without shared copies', async () => {
  const { host, record, driver } = await fixture();
  expect(host.sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get('topic')).toBe(content);
  expect(host.sqlite.prepare('SELECT count(*) FROM content_blob_data').pluck().get()).toBe(0);
  host.sqlite.exec('DELETE FROM content_blob_data');
  expect(loadNodeBodyResolution(driver, 'topic')).toMatchObject({ status: 'resolved', content });
  expect(loadWorkspaceNodeDocument(driver, 'topic')).toMatchObject({ content, currentVersionId: record.version_id });
  expect(await loadCompanionWorkspaceNodeFromDb(host.db, 'topic')).toMatchObject({ content });
  expect((await host.current()).content_hash).toBe(record.content_hash);
});

it.each([false, true])('converts legacy projected text atomically through companion=%s', async (companion) => {
  const { host, record, driver } = await fixture();
  upsertTextBodyBlob(driver, content, record.updated_at);
  host.sqlite.prepare('UPDATE nodes SET content = ? WHERE id = ?').run(projectNodeInlineContent(content), 'topic');
  host.sqlite.pragma(`user_version = ${companion ? 78 : 149}`);
  const versions = host.sqlite.prepare('SELECT * FROM node_sync_versions').all();
  if (companion) await host.db.transaction((tx) => migrateCompanionDatabase(tx, 78, 79));
  else initializeDatabaseSchema(host.sqlite);
  host.sqlite.exec('DELETE FROM content_blob_data');
  expect(loadNodeBodyResolution(driver, 'topic')).toMatchObject({ status: 'resolved', content });
  expect(host.sqlite.prepare('SELECT * FROM node_sync_versions').all()).toEqual(versions);
  expect((await host.current()).version_id).toBe(record.version_id);
  if (companion) await host.db.transaction((tx) => migrateCompanionDatabase(tx, 79, 79));
  else initializeDatabaseSchema(host.sqlite);
});

it.each([false, true])('keeps already complete current text during upgrade without requiring an obsolete shared copy companion=%s', async (companion) => {
  const { host, record, driver } = await fixture();
  host.sqlite.pragma(`user_version = ${companion ? 78 : 149}`);
  const versions = host.sqlite.prepare('SELECT * FROM node_sync_versions').all();
  if (companion) await host.db.transaction((tx) => migrateCompanionDatabase(tx, 78, 79));
  else initializeDatabaseSchema(host.sqlite);
  expect(loadNodeBodyResolution(driver, 'topic')).toMatchObject({ status: 'resolved', content });
  expect(host.sqlite.prepare('SELECT * FROM node_sync_versions').all()).toEqual(versions);
  expect((await host.current()).version_id).toBe(record.version_id);
});

it.each([false, true])('preserves contradictory inline text and schema version on failed conversion companion=%s', async (companion) => {
  const { host, record, driver } = await fixture();
  upsertTextBodyBlob(driver, content, record.updated_at);
  host.sqlite.prepare('UPDATE nodes SET content = ? WHERE id = ?').run('Unreconciled user text', 'topic');
  host.sqlite.pragma(`user_version = ${companion ? 78 : 149}`);
  const upgrade = async () => {
    if (companion) await host.db.transaction((tx) => migrateCompanionDatabase(tx, 78, 79));
    else initializeDatabaseSchema(host.sqlite);
  };
  await expect(upgrade()).rejects.toThrow('node_body_migration_contradictory_inline');
  expect(host.sqlite.pragma('user_version', { simple: true })).toBe(companion ? 78 : 149);
  expect(host.sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get('topic')).toBe('Unreconciled user text');
});

it('finds current image demand after receiving text without shared body data', async () => {
  const host = textDevice();
  devices.push(host);
  const image = `${'a'.repeat(64)}.png`;
  await host.receive([textBranch('image-version', `![Image](asset://${image})`)]);
  host.sqlite.exec('DELETE FROM content_blob_data');
  expect((await loadNodeOwnedArticleResourceNeeds(host.db, ['topic'])).needs.map((need) => need.storageKey))
    .toEqual([image]);
});
