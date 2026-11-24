// @vitest-environment node

import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const measurements = vi.hoisted(() => ({ substringChecks: 0 }));
vi.mock('node:module', async (importOriginal) => {
  const { createRequire } = await importOriginal<typeof import('node:module')>();
  const { DatabaseSync: Sqlite } = await import('node:sqlite');
  return {
    createRequire: (url: string) => (name: string) => {
      if (name !== 'better-sqlite3') return createRequire(url)(name) as unknown;
      return class {
        private readonly sqlite: InstanceType<typeof Sqlite>;
        constructor(filename: string) {
          this.sqlite = new Sqlite(filename, { readOnly: true });
          this.sqlite.function('instr', (text, query) => {
            measurements.substringChecks += 1;
            return String(text).indexOf(String(query)) + 1;
          });
        }
        pragma(sql: string) { this.sqlite.exec(`PRAGMA ${sql}`); }
        prepare(sql: string) {
          const statement = this.sqlite.prepare(sql);
          return Object.assign(statement, {
            pluck: () => ({ get: () => Object.values(statement.get() ?? {})[0] as unknown })
          });
        }
        close() { this.sqlite.close(); }
      };
    }
  };
});

import { BackupSearchWorkerEngine } from './backupSearchWorker.js';

let root = '';
let directory = '';
let engine: BackupSearchWorkerEngine;
const expectedIds = Array.from({ length: 205 }, (_, index) => String(index).padStart(3, '0'));

beforeEach(async () => {
  measurements.substringChecks = 0;
  root = await mkdtemp(path.join(tmpdir(), 'foliole-backup-search-cursor-'));
  directory = path.join(root, 'session');
  await mkdir(directory);
  const filename = path.join(root, 'library.db');
  const sqlite = new DatabaseSync(filename);
  try {
    sqlite.exec('CREATE TABLE nodes (id TEXT PRIMARY KEY, title TEXT, content TEXT, parent_id TEXT)');
    sqlite.exec("INSERT INTO nodes VALUES ('root', 'Archive', '', NULL), ('section', 'Section', '', 'root')");
    const insert = sqlite.prepare("INSERT INTO nodes VALUES (?, ?, 'body with needle', 'section')");
    for (const id of expectedIds) insert.run(id, `Topic ${id}`);
  } finally {
    sqlite.close();
  }
  engine = new BackupSearchWorkerEngine({
    backups: [{ fileName: 'library.db', filePath: filename, updatedAt: '2026-09-10T00:00:00.000Z' }],
    query: 'needle',
    sessionDirectory: directory
  });
});

afterEach(async () => {
  try {
    await engine?.dispose();
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

it('returns the ordered matches without repeating substring checks over the backup', async () => {
  const first = await engine.next();
  expect(first).toMatchObject({ status: 'match', match: { node_id: expectedIds[0], path: 'Section' } });
  const initialChecks = measurements.substringChecks;
  expect(initialChecks).toBeGreaterThan(0);

  for (const id of expectedIds.slice(1)) {
    await expect(engine.next()).resolves.toMatchObject({ status: 'match', match: { node_id: id } });
  }
  await expect(engine.next()).resolves.toEqual({ skipped_backup_count: 0, status: 'complete' });
  expect(measurements.substringChecks).toBe(initialChecks);
  expect(await readdir(directory)).toEqual([]);
});

it('releases the unfinished query and its private backup when search stops', async () => {
  await expect(engine.next()).resolves.toMatchObject({ status: 'match' });
  await engine.dispose();
  expect(await readdir(directory)).toEqual([]);
});

it('keeps title priority, blob bodies and cross-backup deduplication when advancing the cursor', async () => {
  const filename = path.join(root, 'modern.db');
  const sqlite = new DatabaseSync(filename);
  try {
    sqlite.exec(`
      CREATE TABLE nodes (id TEXT PRIMARY KEY, title TEXT, content TEXT, parent_id TEXT, deleted_at TEXT, body_blob_hash TEXT);
      CREATE TABLE content_blob_data (hash TEXT PRIMARY KEY, data BLOB NOT NULL);
      INSERT INTO content_blob_data VALUES ('blob-hash', CAST('needle in the complete blob body' AS BLOB));
      INSERT INTO nodes VALUES
        ('000', 'Z Needle title', 'body with needle', NULL, NULL, NULL),
        ('blob', 'A body-only match', 'legacy placeholder', NULL, 'deleted', 'blob-hash');
    `);
  } finally {
    sqlite.close();
  }
  engine = new BackupSearchWorkerEngine({
    backups: [
      { fileName: 'modern.db', filePath: filename, updatedAt: '2026-09-11T00:00:00.000Z' },
      { fileName: 'library.db', filePath: path.join(root, 'library.db'), updatedAt: '2026-09-10T00:00:00.000Z' }
    ],
    query: 'needle',
    sessionDirectory: directory
  });

  await expect(engine.next()).resolves.toMatchObject({
    status: 'match', match: { backup_name: 'modern.db', node_id: '000', title: 'Z Needle title' }
  });
  await expect(engine.next()).resolves.toMatchObject({
    status: 'match', match: { content: 'needle in the complete blob body', deleted: true, node_id: 'blob' }
  });
  await expect(engine.next()).resolves.toMatchObject({
    status: 'match', match: { backup_name: 'library.db', node_id: '001' }
  });
});
