import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { afterEach, beforeEach, expect, vi } from 'vitest';

const mockExtraction = vi.hoisted(() => ({
  root: '', loaded: null as null | (() => void), gate: null as Promise<void> | null,
  failPage: false, beforeProcess: null as null | (() => void), finished: null as null | (() => void)
}));
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_cache_dir: path.join(mockExtraction.root, 'cache'), app_config_dir: path.join(mockExtraction.root, 'config'),
  app_data_dir: mockExtraction.root, app_log_dir: path.join(mockExtraction.root, 'logs')
}) }));
vi.mock('../ipc/boot.js', () => ({ appendBootEvent: async () => undefined }));
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', async (importOriginal) => {
  const original = await importOriginal<typeof import('pdfjs-dist/legacy/build/pdf.mjs')>();
  return { ...original, getDocument: (...args: Parameters<typeof original.getDocument>) => {
    const task = original.getDocument(...args);
    return { promise: task.promise.then(async (document) => {
      const destroy = document.destroy.bind(document);
      document.destroy = async () => { await destroy(); mockExtraction.finished?.(); };
      mockExtraction.loaded?.();
      if (mockExtraction.gate) await mockExtraction.gate;
      if (mockExtraction.failPage) document.getPage = async () => { throw new Error('isolated extraction failure'); };
      return document;
    }) };
  } };
});

export const extraction = mockExtraction;

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { publishAttachmentLibraryPathSnapshot } from '../attachments/attachmentLibraryPathSnapshot.js';
import { desktopTaskScheduler } from '../desktopTaskScheduler.js';

import { closeDatabaseConnection, openDatabaseConnection, runWithDatabaseConnectionOwner } from './connection.js';
import { migrateDesktopHostProfile } from './hostProfile.js';
import { markPdfAttachmentIndexPending } from './pdfIndexing.js';

const BetterSqlite3 = createRequire(import.meta.url)('better-sqlite3') as typeof import('better-sqlite3');
export const pdfBytes = fs.readFileSync('tests/desktop/fixtures/pdf-user-journey.pdf');
export const pdfId = createHash('sha256').update(pdfBytes).digest('hex');
let observer: import('better-sqlite3').Database;
export let tasks: Promise<unknown>[];
let assetsDir: string;
export function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}
export function status() {
  return observer.prepare('SELECT status, attempt, error FROM pdf_index_state WHERE attachment_id = ?').get(pdfId);
}
export function pageText() {
  return observer.prepare('SELECT text FROM pdf_page_text WHERE attachment_id = ? ORDER BY page').all(pdfId);
}
export function readOriginalPdf() {
  return fs.readFileSync(path.join(assetsDir, `${pdfId}.pdf`));
}
export function removeOriginalPdf() {
  fs.unlinkSync(path.join(assetsDir, `${pdfId}.pdf`));
}
export function seedPriorText() {
  openDatabaseConnection().driver.execute('INSERT INTO pdf_page_text (attachment_id, page, text) VALUES (?, 1, ?)', [pdfId, 'Prior successful page text']);
}
export function pauseExtraction() {
  const loaded = deferred();
  const gate = deferred();
  mockExtraction.loaded = loaded.release;
  mockExtraction.gate = gate.promise;
  return { loaded: loaded.promise, release: gate.release };
}
export async function holdOwner() {
  const gate = deferred();
  const entered = deferred();
  const owned = runWithDatabaseConnectionOwner(async () => { entered.release(); await gate.promise; });
  await entered.promise;
  return { release: async () => { gate.release(); await owned; } };
}
export async function drainAttempts(count: number) {
  for (let attempt = 0; attempt < count; attempt += 1) {
    await vi.waitFor(() => expect(tasks.length).toBeGreaterThan(attempt));
    await tasks[attempt];
  }
}
export function reopenDatabase() {
  closeDatabaseConnection();
  openDatabaseConnection();
  publishAttachmentLibraryPathSnapshot({ assetsDir, libraryScope: mockExtraction.root });
}

beforeEach(() => {
  fs.mkdirSync(path.resolve('.tmp/artifacts/T268'), { recursive: true });
  mockExtraction.root = fs.mkdtempSync(path.resolve('.tmp/artifacts/T268/library-'));
  mockExtraction.loaded = null;
  mockExtraction.gate = null;
  mockExtraction.failPage = false;
  mockExtraction.beforeProcess = null;
  mockExtraction.finished = null;
  tasks = [];
  const connection = openDatabaseConnection();
  initializeDatabaseSchema(connection.sqlite);
  migrateDesktopHostProfile(connection, 'isolated-pdf-test-host');
  assetsDir = path.join(mockExtraction.root, 'assets');
  fs.mkdirSync(assetsDir);
  fs.writeFileSync(path.join(assetsDir, `${pdfId}.pdf`), pdfBytes);
  publishAttachmentLibraryPathSnapshot({ assetsDir, libraryScope: mockExtraction.root });
  const reference = JSON.stringify([{ storage_key: `${pdfId}.pdf`, original_name: 'sample.pdf', role: 'reference' }]);
  connection.driver.execute(`INSERT INTO nodes (id, title, resource_references, created_at, updated_at)
    VALUES ('pdf-topic', 'PDF', ?, '2026-10-01', '2026-10-01')`, [reference]);
  markPdfAttachmentIndexPending(pdfId);
  observer = new BetterSqlite3(connection.dbPath, { readonly: true });
  const submit = desktopTaskScheduler.submit.bind(desktopTaskScheduler);
  vi.spyOn(desktopTaskScheduler, 'submit').mockImplementation((definition) => {
    let firstYield = true;
    const handle = submit({ ...definition, run: (context) => definition.run({ ...context,
      yieldIfNeeded: async () => {
        await context.yieldIfNeeded();
        if (firstYield) { firstYield = false; mockExtraction.beforeProcess?.(); }
      }
    }) });
    if (definition.id === `pdf-indexing:${pdfId}`) tasks.push(handle.promise);
    return handle;
  });
});
afterEach(async () => {
  await Promise.allSettled(tasks);
  vi.restoreAllMocks();
  observer.close();
  closeDatabaseConnection();
  fs.rmSync(mockExtraction.root, { recursive: true, force: true });
});
