// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { readCompleteAttachmentReferenceKeys, saveAttachmentReferenceResults } from '../../lib/core/attachments/attachmentReferenceCache.js';
import { readAttachmentReferenceSnapshot } from '../../lib/core/attachments/attachmentReferenceSnapshot.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

import { runAttachmentReferenceWorker } from './attachmentReferenceWorkerClient.js';

vi.mock('node:worker_threads', async importOriginal => {
  const actual = await importOriginal<typeof import('node:worker_threads')>();
  return { ...actual, Worker: class extends actual.Worker {
    constructor(_url: URL, options: import('node:worker_threads').WorkerOptions) {
      super(path.resolve('dist/electron/attachments/attachmentReferenceWorker.js'), options);
    }
  } };
});

const key = `${'a'.repeat(64)}.png`;
const nextKey = `${'b'.repeat(64)}.png`;
function fixture(count: number) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-worker-'));
  const databasePath = path.join(root, 'library.db');
  let sqlite = new Database(databasePath);
  initializeDatabaseSchema(sqlite);
  const text = `![image](asset://${key}) ${'paragraph '.repeat(820)}`;
  const insert = sqlite.prepare(`INSERT INTO nodes(id,title,content,body_blob_hash,created_at,updated_at)
    VALUES (?,'Article',?,?,'2000','2000')`);
  sqlite.transaction(() => {
    for (let i = 0; i < count; i++) insert.run(String(i).padStart(6, '0'), text, hashTextBody(text));
  })();
  const db = () => createBetterSqliteDbPort(sqlite);
  const scan = (signal?: AbortSignal) => runAttachmentReferenceWorker(databasePath,
    rows => saveAttachmentReferenceResults(db(), rows), signal);
  const reopen = () => { sqlite.close(); sqlite = new Database(databasePath); };
  return { databasePath, db, scan, reopen, sqlite: () => sqlite,
    close: () => { sqlite.close(); fs.rmSync(root, { recursive: true, force: true }); } };
}

it.each([1000, 10000])('parses only changed inputs across reopen and matches full references: %i nodes', async count => {
  const f = fixture(count);
  try {
    const started = performance.now();
    expect(await f.scan()).toBe(count);
    const full = await readAttachmentReferenceSnapshot(f.db());
    expect(await readCompleteAttachmentReferenceKeys(f.db())).toEqual(full.storageKeys.sort());
    f.reopen();
    expect(await f.scan()).toBe(0);
    const changed = count / 10;
    const text = `![new](asset://${nextKey})`;
    f.sqlite().prepare('UPDATE nodes SET content=?,body_blob_hash=? WHERE id < ?')
      .run(text, hashTextBody(text), String(changed).padStart(6, '0'));
    expect(await f.scan()).toBe(changed);
    expect(await readCompleteAttachmentReferenceKeys(f.db())).toEqual([key, nextKey]);
    console.info(JSON.stringify({ nodes: count, changed, elapsedMs: Math.round(performance.now() - started) }));
  } finally { f.close(); }
});

it('allows foreground edits, discards stale rows, and resumes persisted batches after cancellation', async () => {
  const f = fixture(300);
  try {
    const controller = new AbortController();
    let batches = 0;
    await expect(runAttachmentReferenceWorker(f.databasePath, async rows => {
      batches++;
      // The independent reader has released its read transaction before this foreground write.
      const text = `![new](asset://${nextKey})`;
      f.sqlite().prepare('UPDATE nodes SET content=?,body_blob_hash=? WHERE id=?')
        .run(text, hashTextBody(text), rows[0]!.id);
      expect(await saveAttachmentReferenceResults(f.db(), rows)).toBe(rows.length - 1);
      controller.abort(new Error('user_active'));
    }, controller.signal)).rejects.toThrow('user_active');
    expect(batches).toBe(1);
    expect(await readCompleteAttachmentReferenceKeys(f.db())).toBeNull();
    const committed = f.sqlite().prepare('SELECT count(*) FROM attachment_reference_cache').pluck().get() as number;
    expect(committed).toBeGreaterThan(0);
    f.reopen();
    expect(await f.scan()).toBe(300 - committed);
    expect(await readCompleteAttachmentReferenceKeys(f.db())).toEqual([key, nextKey]);
  } finally { f.close(); }
});

it('terminates on invalid input and missing libraries without publishing an empty complete result', async () => {
  const f = fixture(1);
  try {
    f.sqlite().exec('UPDATE nodes SET body_blob_hash=NULL');
    await expect(f.scan()).rejects.toThrow('attachment_scan_body_unreadable');
    expect(await readCompleteAttachmentReferenceKeys(f.db())).toBeNull();
    await expect(runAttachmentReferenceWorker(`${f.databasePath}.missing`, async () => {})).rejects.toThrow();
    expect(fs.existsSync(`${f.databasePath}.missing`)).toBe(false);
  } finally { f.close(); }
});
