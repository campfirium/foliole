// @vitest-environment node
import { mkdirSync, writeFileSync } from 'node:fs';

import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: () => ({
    configureFramedSyncPayloadBudget: async () => undefined,
    closeFramedSyncPayloadBudget: async () => undefined
  })
}));

import { searchCompanionFullTextSnapshot } from '../../companionFullTextSearch';

import { createSearchLibrary } from './companionSearchSnapshot.testSupport';
import { writeIosCompanionDatabase } from './iosCompanionActiveDatabase';

let library: Awaited<ReturnType<typeof createSearchLibrary>> | null = null;
afterEach(async () => { await library?.close(); library = null; });
const identities = (result: Awaited<ReturnType<typeof searchCompanionFullTextSnapshot>>) => ({
  topics: result.topics.map((item) => item.nodeId), external: result.external.map((item) => item.document_id),
  pdf: result.pdf.map((item) => `${item.attachment_id}:${item.page}`)
});

it.each(['remove', 'insert', 'reorder'] as const)('keeps all three result sets fixed across %s and rebuilds only for a new search', async (change) => {
  library = await createSearchLibrary();
  const snapshot = await searchCompanionFullTextSnapshot('alpha');
  const original = identities(snapshot);
  await writeIosCompanionDatabase(async (db) => {
    if (change === 'remove') {
      await db.run("UPDATE nodes SET deleted_at='now' WHERE id='000124'");
      await db.run("UPDATE external_documents SET is_present=0 WHERE document_id='000124'");
      await db.run('DELETE FROM pdf_page_text WHERE page=1');
    } else if (change === 'insert') {
      await db.run("INSERT INTO nodes (id,title,content,created_at,updated_at) VALUES ('new','new','alpha','zzz','zzz')");
      await db.run("INSERT INTO pdf_page_text (attachment_id,page,text) VALUES ('aaa',1,'alpha')");
      await db.run(`INSERT INTO external_documents (document_id,folder_id,relative_path,file_name,extension,
        source_size_bytes,source_modified_at,source_modified_ms,content_hash,title,content,indexed_at,created_at,updated_at)
        VALUES ('new','folder','new.md','new.md','md',0,'now',0,'new','New','alpha','now','now','zzz')`);
    } else {
      await db.run("UPDATE nodes SET updated_at='zzz',content='changed alpha' WHERE id='000000'");
      await db.run("UPDATE external_documents SET updated_at='zzz',content='changed alpha' WHERE document_id='000000'");
      await db.run("UPDATE pdf_page_text SET text='no match' WHERE page=1");
    }
  });
  for (const kind of ['topics', 'pdf', 'external'] as const) {
    const collected = [];
    for (let offset = 0; offset < 140; offset += 20) collected.push(...snapshot[kind].slice(offset, offset + 20));
    expect(collected).toEqual(snapshot[kind]);
    expect(new Set(original[kind]).size).toBe(125);
  }
  expect(identities(snapshot)).toEqual(original);
  expect(identities(await searchCompanionFullTextSnapshot('alpha'))).not.toEqual(original);
  expect(snapshot.external.every((row) => row.content === '')).toBe(true);
  expect(snapshot.pdf.every((row) => row.text === '')).toBe(true);
});

it('serializes all categories with a real writer and keeps committed facts after a subsequent rollback', async () => {
  library = await createSearchLibrary();
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const originalQuery = library.connection.query;
  library.connection.query = async (sql, params) => {
    const result = await originalQuery(sql, params);
    if (sql.startsWith('SELECT') && sql.includes(' FROM (')) { entered(); await gate; }
    return result;
  };
  const searching = searchCompanionFullTextSnapshot('alpha');
  await started;
  let wrote = false;
  const writer = writeIosCompanionDatabase(async (db) => {
    await db.transaction(async (tx) => {
      await tx.run("UPDATE nodes SET deleted_at='gone' WHERE id='000124'");
      await tx.run("UPDATE external_documents SET is_present=0 WHERE document_id='000124'");
      await tx.run('DELETE FROM pdf_page_text WHERE page=1');
    });
    wrote = true;
    await db.transaction(async (tx) => {
      await tx.run("DELETE FROM pdf_page_text WHERE page=2");
      throw new Error('later apply failed');
    });
  });
  expect(wrote).toBe(false);
  release();
  const snapshot = await searching;
  await expect(writer).rejects.toThrow('later apply failed');
  library.connection.query = originalQuery;
  expect(Object.values(identities(snapshot)).map((rows) => rows.length)).toEqual([125, 125, 125]);
  const current = await searchCompanionFullTextSnapshot('alpha');
  expect(Object.values(identities(current)).map((rows) => rows.length)).toEqual([124, 124, 124]);
  expect(current.pdf.some((row) => row.page === 2)).toBe(true);
});

it.each([1000, 10000])('measures a lightweight snapshot for %s matches in each category', async (count) => {
  library = await createSearchLibrary(count);
  let writerWaitMs = 0;
  let waiting: Promise<void> | null = null;
  const query = library.connection.query;
  library.connection.query = async (sql, params) => {
    const rows = await query(sql, params);
    if (sql.includes(' FROM (') && !waiting) {
      const queuedAt = performance.now();
      waiting = writeIosCompanionDatabase(async (db) => {
        await db.run("UPDATE nodes SET title=title WHERE id='000000'");
        writerWaitMs = performance.now() - queuedAt;
      });
    }
    return rows;
  };
  const before = process.memoryUsage().heapUsed;
  const start = performance.now();
  const snapshot = await searchCompanionFullTextSnapshot('alpha');
  const elapsed = performance.now() - start;
  const heapGrowth = process.memoryUsage().heapUsed - before;
  await waiting;
  const bytes = Buffer.byteLength(JSON.stringify(snapshot));
  expect(Object.values(identities(snapshot)).map((rows) => rows.length)).toEqual([count, count, count]);
  expect(bytes).toBeLessThan(count * 2000);
  const artifact = '.tmp/artifacts/t308-snapshot';
  mkdirSync(artifact, { recursive: true });
  writeFileSync(`${artifact}/capacity-${count}.json`, JSON.stringify({ countPerKind: count, elapsedMs: elapsed,
    serializedBytes: bytes, writerWaitMs, heapGrowthBytes: heapGrowth, processRssBytes: process.memoryUsage().rss }, null, 2));
}, 30000);
