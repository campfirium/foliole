// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { DESKTOP_FRESH_SCHEMA_STATEMENTS } from '../../lib/core/database/desktopFreshSchemaStatements.js';
import type { DatabaseBindParams, DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import { clearAttachmentLibraryPathSnapshot, publishAttachmentLibraryPathSnapshot } from '../attachments/attachmentLibraryPathSnapshot.js';
import { setAttachmentPublishedListener } from '../attachments/attachmentPublishedEvents.js';
import { longTextPdf } from '../database/longTextPdfTestFixture.js';
import { readCurrentPdfDocumentPage, searchCurrentPdfDocument } from '../database/pdfDocumentSearch.js';
import { desktopTaskScheduler } from '../desktopTaskScheduler.js';

import { captureLibraryMergeTarget, copyLibraryMergeAttachments } from './desktopLibraryMergeAttachments.js';

const connection = vi.hoisted(() => ({ current: null as object | null }));
vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: () => connection.current,
  runWithDatabaseConnectionOwner: (fn: () => unknown) => fn()
}));

const pdf = Buffer.from(longTextPdf(1), 'latin1');
const hash = createHash('sha256').update(pdf).digest('hex');
const key = `${hash}.pdf`;
const now = '2026-11-24T00:00:00.000Z';
let temp: string;
let assets: string;
let db: DatabaseSync;

function createConnection(sqlite: DatabaseSync) {
  const driver: DatabaseDriver = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return {
        sql,
        run(params = []) {
          const { changes, lastInsertRowid } = statement.run(...params);
          return { changes: Number(changes), lastInsertRowId: lastInsertRowid };
        },
        get<T extends DatabaseRow>(params: DatabaseBindParams = []) {
          return statement.get(...params) as T | undefined;
        },
        all<T extends DatabaseRow>(params: DatabaseBindParams = []) {
          return statement.all(...params) as T[];
        }
      };
    },
    execute(sql, params) {
      return driver.prepare(sql).run(params);
    },
    queryOne<T extends DatabaseRow>(sql: string, params?: DatabaseBindParams) {
      return driver.prepare(sql).get<T>(params);
    },
    queryAll<T extends DatabaseRow>(sql: string, params?: DatabaseBindParams) {
      return driver.prepare(sql).all<T>(params);
    },
    transaction(execute) {
      return transaction(() => execute(driver))();
    }
  };
  function transaction<T>(execute: () => T) {
    return () => {
      sqlite.exec('SAVEPOINT test_transaction');
      try {
        const result = execute();
        sqlite.exec('RELEASE test_transaction');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK TO test_transaction; RELEASE test_transaction');
        throw error;
      }
    };
  }
  return { driver, sqlite: { transaction } };
}

beforeEach(async () => {
  temp = await mkdtemp(path.join(tmpdir(), 'foliole-merge-pdf-'));
  assets = path.join(temp, 'assets');
  publishAttachmentLibraryPathSnapshot({ assetsDir: assets, libraryScope: temp });
  db = new DatabaseSync(path.join(temp, 'target.db'));
  for (const statement of DESKTOP_FRESH_SCHEMA_STATEMENTS) db.exec(statement);
  connection.current = createConnection(db);
  db.prepare(`INSERT INTO nodes (id, title, content, resource_references, created_at, updated_at) VALUES
    ('merged-pdf', 'Merged PDF', 'PDF placeholder', ?, ?, ?)`)
    .run(JSON.stringify([{ storage_key: key, original_name: 'merged.pdf', role: 'reference' }]), now, now);
});

afterEach(async () => {
  setAttachmentPublishedListener(null);
  db.close();
  connection.current = null;
  clearAttachmentLibraryPathSnapshot();
  await rm(temp, { recursive: true, force: true });
});

function copyAttachments(directory: string | null) {
  return copyLibraryMergeAttachments([key], directory, captureLibraryMergeTarget());
}

async function expectSearchablePdf() {
  expect(searchCurrentPdfDocument('merged-pdf', 'quick brown fox').status).not.toBe('unavailable');
  await vi.waitFor(() => {
    const search = searchCurrentPdfDocument('merged-pdf', 'quick brown fox');
    expect(search.status).toBe('ready');
    expect(search.matches[0]).toMatchObject({ page: 1 });
  });
  expect(readCurrentPdfDocumentPage('merged-pdf', 1)).toMatchObject({
    page: { page: 1, text: expect.stringContaining('quick brown fox') }, pageCount: 1, status: 'ready'
  });
  expect(db.prepare("SELECT content FROM nodes WHERE id = 'merged-pdf'").get()).toEqual({ content: 'PDF placeholder' });
}

it('indexes newly copied PDF text and preserves an already ready index on rerun', async () => {
  const sourceAssets = path.join(temp, 'source-assets');
  await mkdir(sourceAssets);
  await writeFile(path.join(sourceAssets, key), pdf);

  expect(await copyAttachments(sourceAssets)).toEqual({ copied: 1, missing: 0 });
  expect(await readFile(path.join(assets, key))).toEqual(pdf);
  expect(db.prepare('SELECT available FROM framed_sync_resource_availability WHERE hash = ?').get(hash))
    .toEqual({ available: 1 });
  await expectSearchablePdf();

  const state = db.prepare('SELECT * FROM pdf_index_state WHERE attachment_id = ?');
  const readyIndex = state.get(hash);
  expect(await copyAttachments(sourceAssets)).toEqual({ copied: 0, missing: 0 });
  expect(state.get(hash)).toEqual(readyIndex);
});

it('indexes an existing local PDF that has no index record on rerun', async () => {
  await mkdir(assets);
  await writeFile(path.join(assets, key), pdf);

  expect(await copyAttachments(null)).toEqual({ copied: 0, missing: 0 });
  await expectSearchablePdf();
});

it.each(['pending', 'indexing'])('resumes a PDF left %s when merging its attachment again', async status => {
  await mkdir(assets);
  await writeFile(path.join(assets, key), pdf);
  db.prepare('INSERT INTO pdf_index_state (attachment_id, status, version, attempt) VALUES (?, ?, 1, 1)')
    .run(hash, status);

  expect(await copyAttachments(null)).toEqual({ copied: 0, missing: 0 });
  await expectSearchablePdf();
});

it('requeues a merged PDF after a library operation cancels its pending task', async () => {
  await mkdir(assets);
  await writeFile(path.join(assets, key), pdf);
  const resumeLibrary = await desktopTaskScheduler.pauseResource('library');
  try {
    expect(await copyAttachments(null)).toEqual({ copied: 0, missing: 0 });
    expect(searchCurrentPdfDocument('merged-pdf', 'quick brown fox').status).toBe('pending');
    await desktopTaskScheduler.pauseResource('library');
  } finally { resumeLibrary(); }

  expect(await copyAttachments(null)).toEqual({ copied: 0, missing: 0 });
  await expectSearchablePdf();
});

it('reconciles availability when the file was published but the database write failed', async () => {
  const sourceAssets = path.join(temp, 'source-assets');
  await mkdir(sourceAssets);
  await writeFile(path.join(sourceAssets, key), pdf);
  db.exec(`CREATE TEMP TRIGGER reject_available BEFORE INSERT ON framed_sync_resource_availability
    BEGIN SELECT RAISE(ABORT, 'interrupted_availability'); END`);
  await expect(copyAttachments(sourceAssets)).rejects.toThrow('interrupted_availability');
  expect(await readFile(path.join(assets, key))).toEqual(pdf);
  db.exec('DROP TRIGGER reject_available');

  expect(await copyAttachments(null)).toEqual({ copied: 0, missing: 0 });
  await expectSearchablePdf();
  expect(db.prepare('SELECT available FROM framed_sync_resource_availability WHERE hash = ?').get(hash))
    .toEqual({ available: 1 });
});

it.each(['source', 'target'])('reports a non-file at the %s attachment path as missing', async location => {
  const sourceAssets = path.join(temp, 'source-assets');
  await mkdir(path.join(location === 'source' ? sourceAssets : assets, key), { recursive: true });
  expect(await copyAttachments(sourceAssets)).toEqual({ copied: 0, missing: 1 });
  expect(searchCurrentPdfDocument('merged-pdf', 'quick brown fox').status).toBe('unavailable');
});

it('keeps a published file and its indexing state isolated when the library changes during a merge', async () => {
  const sourceAssets = path.join(temp, 'source-assets');
  await mkdir(sourceAssets);
  await writeFile(path.join(sourceAssets, key), pdf);
  const nextDb = new DatabaseSync(':memory:');
  const previousConnection = connection.current;
  try {
    for (const statement of DESKTOP_FRESH_SCHEMA_STATEMENTS) nextDb.exec(statement);
    setAttachmentPublishedListener(() => {
      connection.current = createConnection(nextDb);
      publishAttachmentLibraryPathSnapshot({ assetsDir: path.join(temp, 'other-assets'), libraryScope: 'other' });
    });

    await expect(copyAttachments(sourceAssets)).rejects.toThrow('library_merge_target_changed');
    expect(await readFile(path.join(assets, key))).toEqual(pdf);
    expect(nextDb.prepare('SELECT * FROM framed_sync_resource_availability').all()).toEqual([]);
    expect(nextDb.prepare('SELECT * FROM pdf_index_state').all()).toEqual([]);
    connection.current = previousConnection;
    publishAttachmentLibraryPathSnapshot({ assetsDir: assets, libraryScope: temp });
    expect(await copyAttachments(null)).toEqual({ copied: 0, missing: 0 });
    await expectSearchablePdf();
  } finally { nextDb.close(); }
});

it('does not queue an index for a PDF whose file is missing', async () => {
  expect(await copyAttachments(null)).toEqual({ copied: 0, missing: 1 });
  expect(searchCurrentPdfDocument('merged-pdf', 'quick brown fox')).toEqual({ matches: [], status: 'unavailable' });
});
