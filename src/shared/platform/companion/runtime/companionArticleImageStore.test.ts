import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { createCapacitorSqliteDbPort } from '../../capacitorSqliteDbPort';
import { createFakeCapacitorConnection, installCompanionNodeSchema } from '../../companionSyncNodeVersionsTestSupport';

const state = vi.hoisted(() => ({ port: null as unknown }));
const importer = vi.hoisted(() => ({ importCompanionImageResource: vi.fn() }));
vi.mock('./companionImageImporter', () => importer);
vi.mock('../../companionWorkspaceRuntimeRepository', () => ({ FolioleCompanionSync: {} }));
vi.mock('./iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => ({
    read: <T>(task: (db: DbPort) => Promise<T>) => task(state.port as DbPort),
    runWriter: <T>(task: (db: DbPort) => Promise<T>) => task(state.port as DbPort)
  })
}));

import { importCompanionArticleImage } from './companionArticleImageRecovery';
import { commitCompanionImageArticle, readCompanionImageArticle } from './companionArticleImageStore';

let database: Database.Database;
const key = `${'a'.repeat(64)}.png`;
const url = 'https://example.com/image.png';

beforeEach(() => {
  database = new Database(':memory:');
  installCompanionNodeSchema(database);
  database.exec(`INSERT INTO companion_meta (key, value, updated_at) VALUES ('host_name', 'Phone', '2026-09-19');
    INSERT INTO nodes (id, title, content, created_at, updated_at) VALUES ('article', 'Article', 'Before', '2026-09-19', '2026-09-19');`);
  state.port = createCapacitorSqliteDbPort(createFakeCapacitorConnection(database) as never, 'ios');
});

afterEach(() => database.close());

it('writes body and source together through the shared mobile version apply path', async () => {
  const before = await readCompanionImageArticle('article');
  expect(before).toEqual({ content: 'Before', imageSources: {} });
  const after = { content: `![image](asset://${key})`, imageSources: { [key]: url } };
  expect(await commitCompanionImageArticle('article', before!, after)).toBe(true);
  expect(await readCompanionImageArticle('article')).toEqual(after);
  const row = database.prepare('SELECT snapshot_json FROM node_sync_versions WHERE object_id = ?').get('article') as { snapshot_json: string };
  expect(JSON.parse(row.snapshot_json).image_sources).toBe(JSON.stringify(after.imageSources));
  expect(await commitCompanionImageArticle('article', before!, { content: 'stale', imageSources: {} })).toBe(false);
  expect(await readCompanionImageArticle('article')).toEqual(after);
});

it('keeps the filename on the article without an attachment registry', async () => {
  const before = await readCompanionImageArticle('article');
  const after = { content: `![image](asset://${key})`, imageSources: { [key]: url } };
  expect(await commitCompanionImageArticle('article', before!, after,
    { storage_key: key, role: 'image', original_name: 'Original.png' })).toBe(true);
  const row = database.prepare('SELECT resource_references FROM nodes WHERE id = ?').get('article') as { resource_references: string };
  expect(JSON.parse(row.resource_references)).toEqual([{ storage_key: key, role: 'image', original_name: 'Original.png' }]);
});

it('persists localized content and its source without an editable renderer or save callback', async () => {
  const original = `![image](${url})\n\n[ordinary](${url})\n\n\`![example](${url})\``;
  database.prepare('UPDATE nodes SET content = ? WHERE id = ?').run(original, 'article');
  importer.importCompanionImageResource.mockResolvedValue({ contentHash: 'a'.repeat(64),
    storageKey: key, originalName: 'image.png', sizeBytes: 8, mimeType: 'image/png', storedFile: 'created' });
  expect(await importCompanionArticleImage('article', url)).toMatchObject({ status: 'imported' });
  const expected = { content: original.replace(`![image](${url})`, `![image](asset://${key})`), imageSources: { [key]: url } };
  expect(await readCompanionImageArticle('article')).toEqual(expected);
  const version = database.prepare('SELECT snapshot_json FROM node_sync_versions WHERE object_id = ?').get('article') as { snapshot_json: string };
  expect(JSON.parse(version.snapshot_json)).toMatchObject({ image_sources: JSON.stringify(expected.imageSources) });
});
