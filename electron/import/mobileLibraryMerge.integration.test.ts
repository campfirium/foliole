// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';
import { INSERT_REVIEW_EVENT_SQL } from '../../lib/core/database/reviewLogRecord.js';
import { writeV082Backup } from '../../src/shared/platform/companion/backupRestore/companionV082Backup.testSupport.js';
import { clearAttachmentLibraryPathSnapshot, publishAttachmentLibraryPathSnapshot } from '../attachments/attachmentLibraryPathSnapshot.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import { createTestZip } from '../ipc/testZipBuilder.js';

import { mergeDesktopLibrary } from './desktopLibraryMerge.js';

type Connection = { driver: ReturnType<typeof createBetterSqlite3Driver>; sqlite: Database.Database; dbPath: string };
const connection = vi.hoisted(() => ({ current: null as Connection | null }));
vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: () => connection.current,
  runWithDatabaseConnectionOwner: (fn: () => unknown) => fn()
}));

const now = '2026-11-22T00:00:00.000Z';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jY1sAAAAASUVORK5CYII=', 'base64');
const pngKey = `${createHash('sha256').update(png).digest('hex')}.png`;
const missingKey = `${'c'.repeat(64)}.png`;
let temp = '';
const opened: Database.Database[] = [];

beforeEach(async () => {
  temp = await mkdtemp(path.join(tmpdir(), 'foliole-mobile-merge-'));
  publishAttachmentLibraryPathSnapshot({ assetsDir: path.join(temp, 'assets'), libraryScope: temp });
});

afterEach(async () => {
  for (const sqlite of opened.splice(0)) if (sqlite.open) sqlite.close();
  clearAttachmentLibraryPathSnapshot();
  await rm(temp, { recursive: true, force: true });
});

function openTarget(): Connection {
  const dbPath = path.join(temp, 'library', 'target.db');
  const sqlite = new Database(dbPath);
  opened.push(sqlite);
  initializeDatabaseSchema(sqlite);
  sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run('host_name', JSON.stringify('desktop'), now);
  const driver = createBetterSqlite3Driver(sqlite);
  bindParentOrderWriter(driver, { deviceAnchor: 'desktop', libraryPath: dbPath });
  const target = { driver, sqlite, dbPath };
  connection.current = target;
  upsertNodeSnapshot({ nodeId: 'shared', parentNodeId: null, kind: 'topic', title: 'Shared', isTitleManual: true,
    content: 'Desktop body', reveal: null, anchorLink: null, position: null, createdAt: now, updatedAt: now });
  return target;
}

/** An older phone library (v0.8.2 schema) as it sits in a folder backup, with one image saved and one missing. */
async function phoneBackupFolder() {
  const folder = path.join(temp, 'Foliole Backup');
  await mkdir(path.join(folder, 'Attachments'), { recursive: true });
  const sqlite = writeV082Backup(path.join(folder, 'Foliole.sqlite'));
  const references = JSON.stringify([{ storage_key: pngKey, role: 'image', original_name: null },
    { storage_key: missingKey, role: 'image', original_name: null }]);
  sqlite.prepare('UPDATE nodes SET content = ?, resource_references = ? WHERE id = ?')
    .run(`![a](asset://${pngKey}) ![b](asset://${missingKey})`, references, 'topic-1');
  sqlite.prepare(`INSERT INTO nodes (id, parent_id, kind, title, content, created_at, updated_at)
    VALUES ('shared', NULL, 'topic', 'Shared', 'Phone body', ?, ?)`).run(now, now);
  sqlite.prepare(INSERT_REVIEW_EVENT_SQL).run(['op-1', 'op-1', 'Main Phone', 'topic-1', 3, 'fsrs-6', '2026-10-03T00:00:00.000Z', 'review', null]);
  sqlite.prepare(INSERT_REVIEW_EVENT_SQL).run(['op-2', 'op-2', 'Main Phone', 'topic-1', 4, 'fsrs-6', '2026-10-06T00:00:00.000Z', 'review', null]);
  sqlite.close();
  await writeFile(path.join(folder, 'Attachments', pngKey), png);
  return folder;
}

async function zipFolder(folder: string, wrap: string) {
  const entries = [{ name: `${wrap}Foliole.sqlite`, content: await readFile(path.join(folder, 'Foliole.sqlite')), compression: 'deflate' as const }];
  for (const name of await readdir(path.join(folder, 'Attachments'))) {
    entries.push({ name: `${wrap}Attachments/${name}`, content: await readFile(path.join(folder, 'Attachments', name)), compression: 'deflate' });
  }
  entries.push({ name: '__MACOSX/._Foliole.sqlite', content: Buffer.from('x'), compression: 'deflate' });
  const file = path.join(temp, 'phone-backup.zip');
  await writeFile(file, createTestZip(entries));
  return file;
}

const run = (sourcePath: string, attachmentsDirectory: string | null = null) =>
  mergeDesktopLibrary({ sourcePath, attachmentsDirectory, folderTitle: 'Merged phone', now });

function expectMerged(target: Connection, result: Awaited<ReturnType<typeof run>>) {
  expect(result).toMatchObject({ added: 1, alternatives: 1, reviewsAdded: 2, attachmentsCopied: 1, attachmentsMissing: 1 });
  expect(target.sqlite.prepare('SELECT parent_id, title FROM nodes WHERE id = ?').get('topic-1'))
    .toEqual({ parent_id: result.folderId, title: 'Images' });
  expect(target.sqlite.prepare('SELECT content FROM nodes WHERE id = ?').get('shared')).toEqual({ content: 'Desktop body' });
  expect(target.sqlite.prepare(`SELECT body_text FROM node_text_alternatives WHERE node_id = 'shared' AND status = 'available'`).all())
    .toEqual([{ body_text: 'Phone body' }]);
  expect(target.sqlite.prepare('SELECT reps FROM node_review WHERE node_id = ?').get('topic-1')).toEqual({ reps: 2 });
}

async function leftovers() {
  return (await readdir(path.join(temp, 'library'))).filter(name => name.startsWith('.foliole-'));
}

beforeEach(async () => { await mkdir(path.join(temp, 'library'), { recursive: true }); });

it('merges a phone backup zip whose files sit inside one folder, attachments included, and adds nothing the second time', async () => {
  const folder = await phoneBackupFolder();
  const zip = await zipFolder(folder, 'Foliole Backup/');
  const before = await readFile(zip);
  const target = openTarget();

  const result = await run(zip);

  expectMerged(target, result);
  expect(await readFile(path.join(temp, 'assets', pngKey))).toEqual(png);
  expect(await run(zip)).toMatchObject({ added: 0, alternatives: 0, reviewsAdded: 0, folderId: result.folderId });
  expect(await readFile(zip)).toEqual(before);
  expect(await leftovers()).toEqual([]);
});

it('merges a phone backup folder chosen by its Foliole.sqlite and reads attachments next to it without touching the folder', async () => {
  const folder = await phoneBackupFolder();
  const database = path.join(folder, 'Foliole.sqlite');
  const before = await readFile(database);
  const target = openTarget();

  expectMerged(target, await run(database, path.join(folder, 'Attachments')));

  expect(await readFile(database)).toEqual(before);
  expect((await readdir(folder)).sort()).toEqual(['Attachments', 'Foliole.sqlite']);
  expect(await leftovers()).toEqual([]);
});

it('merges a phone backup folder chosen as a folder', async () => {
  const folder = await phoneBackupFolder();
  const target = openTarget();
  expectMerged(target, await run(folder));
});

it.each([
  ['a damaged zip', (zip: Buffer) => zip.subarray(0, zip.length - 30)],
  ['a zip with two backups', null],
  ['a zip without a library', () => createTestZip([{ name: 'notes.txt', content: 'hello', compression: 'deflate' }])]
])('rejects %s and leaves the library as it was', async (_label, change) => {
  const folder = await phoneBackupFolder();
  const zip = await zipFolder(folder, '');
  const bytes = await readFile(zip);
  await writeFile(zip, change ? change(bytes) : createTestZip([
    { name: 'a/Foliole.sqlite', content: await readFile(path.join(folder, 'Foliole.sqlite')), compression: 'deflate' },
    { name: 'b/Foliole.sqlite', content: await readFile(path.join(folder, 'Foliole.sqlite')), compression: 'deflate' }]));
  const target = openTarget();
  const count = () => target.sqlite.prepare('SELECT COUNT(*) AS count FROM nodes').get();
  const nodes = count();

  await expect(run(zip)).rejects.toThrow('library_merge_archive_invalid');

  expect(count()).toEqual(nodes);
  expect(await leftovers()).toEqual([]);
});
