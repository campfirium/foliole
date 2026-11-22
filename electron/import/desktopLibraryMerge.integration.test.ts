// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';
import { INSERT_REVIEW_EVENT_SQL } from '../../lib/core/database/reviewLogRecord.js';
import { INBOX_NODE_ID } from '../../lib/core/database/specialNodeIds.js';
import { clearAttachmentLibraryPathSnapshot, publishAttachmentLibraryPathSnapshot } from '../attachments/attachmentLibraryPathSnapshot.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';

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
const missingKey = `${'a'.repeat(64)}.png`;
let temp = '';
const opened: Database.Database[] = [];

function openLibrary(name: string, host: string): Connection {
  const dbPath = path.join(temp, name);
  const sqlite = new Database(dbPath);
  opened.push(sqlite);
  initializeDatabaseSchema(sqlite);
  sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run('host_name', JSON.stringify(host), now);
  const driver = createBetterSqlite3Driver(sqlite);
  bindParentOrderWriter(driver, { deviceAnchor: host, libraryPath: dbPath });
  return { driver, sqlite, dbPath };
}

function addNode(library: Connection, input: { id: string; parent: string | null; kind?: 'folder' | 'topic' | 'item';
  title: string; content?: string; references?: string }) {
  connection.current = library;
  upsertNodeSnapshot({ nodeId: input.id, parentNodeId: input.parent, kind: input.kind ?? 'topic', title: input.title,
    isTitleManual: true, content: input.content ?? '', reveal: null, anchorLink: null, position: null, createdAt: now, updatedAt: now });
  if (input.references) library.sqlite.prepare('UPDATE nodes SET resource_references = ? WHERE id = ?').run(input.references, input.id);
}

function addReview(library: Connection, nodeId: string, opId: string, reviewedAt: string) {
  library.sqlite.prepare(INSERT_REVIEW_EVENT_SQL).run([opId, opId, 'phone', nodeId, 3, 'fsrs-6', reviewedAt, 'review', null]);
}

function node(library: Connection, id: string) {
  return library.sqlite.prepare('SELECT id, parent_id, title, content, deleted_at FROM nodes WHERE id = ?').get(id) as
    { parent_id: string | null; title: string; content: string; deleted_at: string | null } | undefined;
}

beforeEach(async () => {
  temp = await mkdtemp(path.join(tmpdir(), 'foliole-library-merge-'));
  publishAttachmentLibraryPathSnapshot({ assetsDir: path.join(temp, 'assets'), libraryScope: temp });
});

afterEach(async () => {
  for (const sqlite of opened.splice(0)) if (sqlite.open) sqlite.close();
  clearAttachmentLibraryPathSnapshot();
  await rm(temp, { recursive: true, force: true });
});

function sourceLibrary() {
  const source = openLibrary('source.db', 'old-desktop');
  addNode(source, { id: 'folder-a', parent: null, kind: 'folder', title: 'Folder A' });
  addNode(source, { id: 'topic-a1', parent: 'folder-a', title: 'Topic A1', content: `Body ![x](${pngKey}) ![y](${missingKey})`,
    references: JSON.stringify([{ storage_key: pngKey, role: 'image', original_name: null },
      { storage_key: missingKey, role: 'image', original_name: null }]) });
  addNode(source, { id: 'inbox-item', parent: INBOX_NODE_ID, kind: 'item', title: 'Inbox item', content: 'Question' });
  addNode(source, { id: 'shared-same', parent: null, title: 'Shared', content: 'Same body' });
  addNode(source, { id: 'shared-changed', parent: null, title: 'Changed', content: 'Source body' });
  addNode(source, { id: 'deleted-here', parent: null, title: 'Deleted here', content: 'Still alive there' });
  addReview(source, 'inbox-item', 'op-inbox-1', '2026-10-01T00:00:00.000Z');
  addReview(source, 'shared-same', 'op-shared-1', '2026-10-02T00:00:00.000Z');
  addReview(source, 'shared-same', 'op-shared-2', '2026-10-05T00:00:00.000Z');
  addReview(source, 'deleted-here', 'op-deleted-1', '2026-10-03T00:00:00.000Z');
  return source;
}

function targetLibrary() {
  const target = openLibrary('target.db', 'desktop');
  addNode(target, { id: 'shared-same', parent: null, title: 'Shared', content: 'Same body' });
  addNode(target, { id: 'shared-changed', parent: null, title: 'Changed', content: 'Target body' });
  addNode(target, { id: 'deleted-here', parent: null, title: 'Deleted here', content: 'Gone' });
  target.sqlite.prepare('UPDATE nodes SET deleted_at = ? WHERE id = ?').run(now, 'deleted-here');
  addReview(target, 'shared-same', 'op-shared-1', '2026-10-02T00:00:00.000Z');
  return target;
}

async function merge(source: Connection, target: Connection, attachments: string | null, batchSize?: number) {
  source.sqlite.close();
  connection.current = target;
  return mergeDesktopLibrary({ sourcePath: source.dbPath, attachmentsDirectory: attachments, folderTitle: 'Merged library', now,
    ...(batchSize ? { batchSize } : {}) });
}

it('adds new nodes under the merge folder, keeps bodies, adds alternatives and the missing reviews', async () => {
  const source = sourceLibrary();
  const target = targetLibrary();
  const attachments = path.join(temp, 'source-assets');
  await mkdir(attachments);
  await writeFile(path.join(attachments, pngKey), png);

  const result = await merge(source, target, attachments);

  expect(result).toMatchObject({ added: 3, alternatives: 1, unchanged: 1, skippedDeleted: 1, reviewsAdded: 2,
    attachmentsCopied: 1, attachmentsMissing: 1 });
  const folder = node(target, result.folderId!);
  expect(folder).toMatchObject({ parent_id: null, title: 'Merged library' });
  expect(node(target, 'folder-a')?.parent_id).toBe(result.folderId);
  expect(node(target, 'topic-a1')?.parent_id).toBe('folder-a');
  expect(node(target, 'inbox-item')?.parent_id).toBe(result.folderId);
  expect(node(target, 'shared-changed')?.content).toBe('Target body');
  expect(node(target, 'deleted-here')).toMatchObject({ content: 'Gone' });
  expect(target.sqlite.prepare(`SELECT body_text FROM node_text_alternatives WHERE node_id = ? AND status = 'available'`)
    .all('shared-changed')).toEqual([{ body_text: 'Source body' }]);
  expect(target.sqlite.prepare('SELECT op_id FROM review_log ORDER BY op_id').all().map(row => (row as { op_id: string }).op_id))
    .toEqual(['op-inbox-1', 'op-shared-1', 'op-shared-2']);
  expect(target.sqlite.prepare('SELECT reps FROM node_review WHERE node_id = ?').get('shared-same')).toEqual({ reps: 2 });
  expect(target.sqlite.prepare('SELECT reps FROM node_review WHERE node_id = ?').get('inbox-item')).toEqual({ reps: 1 });
  expect(await readFile(path.join(temp, 'assets', pngKey))).toEqual(png);
});

it('adds nothing when the same source is merged again', async () => {
  const source = sourceLibrary();
  const target = targetLibrary();
  const first = await merge(source, target, null);
  const second = await mergeDesktopLibrary({ sourcePath: source.dbPath, attachmentsDirectory: null, folderTitle: 'Merged library', now });
  expect(second).toMatchObject({ added: 0, alternatives: 0, reviewsAdded: 0, folderId: first.folderId });
  expect(target.sqlite.prepare('SELECT COUNT(*) AS count FROM nodes WHERE title = ?').get('Merged library')).toEqual({ count: 1 });
  expect(first.folderId).toBeTruthy();
});

it('finishes an interrupted merge on the next run and keeps children under their own parent', async () => {
  const source = sourceLibrary();
  const target = targetLibrary();
  target.sqlite.exec(`CREATE TEMP TRIGGER fail_child BEFORE INSERT ON nodes WHEN NEW.id = 'topic-a1'
    BEGIN SELECT RAISE(ABORT, 'injected_interruption'); END`);
  await expect(merge(source, target, null, 1)).rejects.toThrow('injected_interruption');
  target.sqlite.exec('DROP TRIGGER fail_child');
  expect(node(target, 'folder-a')).toBeTruthy();
  expect(node(target, 'topic-a1')).toBeUndefined();

  const resumed = await mergeDesktopLibrary({ sourcePath: source.dbPath, attachmentsDirectory: null, folderTitle: 'Merged library', now });
  expect(node(target, 'topic-a1')?.parent_id).toBe('folder-a');
  expect(target.sqlite.prepare('SELECT COUNT(*) AS count FROM nodes WHERE title = ?').get('Merged library')).toEqual({ count: 1 });
  expect(resumed.added).toBeGreaterThan(0);
});

it('rejects merging the open library into itself and leaves the source file unchanged', async () => {
  const target = targetLibrary();
  connection.current = target;
  await expect(mergeDesktopLibrary({ sourcePath: target.dbPath, attachmentsDirectory: null, folderTitle: 'x', now }))
    .rejects.toThrow('library_merge_source_is_current');
});
