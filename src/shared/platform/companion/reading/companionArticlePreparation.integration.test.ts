// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { loadCompanionWorkspaceSyncState } from '../../companionWorkspaceSync';
import { createSearchLibrary } from '../runtime/companionSearchSnapshot.testSupport';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

import { loadPreparedCompanionArticle, prepareCompanionFlowArticle } from './companionArticlePreparation';
import { invalidateCompanionReadingScope } from './companionReadingScope';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});

let library: Awaited<ReturnType<typeof createSearchLibrary>>;
const snapshot = async () => (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
beforeEach(async () => { library = await createSearchLibrary(3, 64); });
afterEach(async () => { await library.close(); vi.restoreAllMocks(); });

async function prepared(source: Awaited<ReturnType<typeof snapshot>>, id = '000001') {
  const reads = vi.spyOn(library.readonlyQueries, 'query');
  prepareCompanionFlowArticle(source, id, '000000');
  await vi.waitFor(() => expect(reads.mock.calls.some(([sql, values]) =>
    sql.includes('SELECT article.*') && values?.[0] === id)).toBe(true));
  // The readonly barrier waits for the complete body read, including annotations and retention.
  await getIosCompanionDatabaseOwner().readInteractiveSnapshot(async () => null);
  return reads;
}

it('prepares the next body without opening it and consumes it without another database read', async () => {
  const source = await snapshot();
  const reads = await prepared(source);
  reads.mockClear();
  prepareCompanionFlowArticle(source, '000002', '000001');
  const article = await loadPreparedCompanionArticle(source, '000001', () => true);
  expect(article?.content).toContain('prefix alpha');
  expect(reads.mock.calls.filter(([sql]) => sql.includes('SELECT article.*'))).toHaveLength(0);
  expect(source.nodesById['000001']!.content).toBe('');
});

it('loads a cache miss normally and merges simultaneous demands with a running prefetch', async () => {
  const source = await snapshot();
  expect((await loadPreparedCompanionArticle(source, '000000', () => true))?.nodeId).toBe('000000');
  let release!: () => void;
  const gate = new Promise<void>(done => { release = done; });
  const blocker = getIosCompanionDatabaseOwner().readInteractiveSnapshot(() => gate);
  const reads = vi.spyOn(library.readonlyQueries, 'query');
  prepareCompanionFlowArticle(source, '000001', '000000');
  await new Promise(done => setTimeout(done, 30));
  const one = loadPreparedCompanionArticle(source, '000001', () => true);
  const two = loadPreparedCompanionArticle(source, '000001', () => true);
  release(); await blocker;
  expect((await one)?.content).toContain('prefix alpha');
  expect(await two).toEqual(await one);
  expect(reads.mock.calls.filter(([sql]) => sql.includes('SELECT article.*'))).toHaveLength(1);
});

it('rejects changed content instead of serving a retained old version', async () => {
  const source = await snapshot();
  await prepared(source);
  library.database.prepare('UPDATE nodes SET content=? WHERE id=?').run('Replacement body', '000001');
  const fresh = await snapshot();
  // Legacy inline nodes have no version; their content facts still invalidate the demand key.
  fresh.nodesById['000001'] = { ...fresh.nodesById['000001']!, content: 'Replacement body' };
  prepareCompanionFlowArticle(fresh, '000001', '000000');
  expect((await loadPreparedCompanionArticle(fresh, '000001', () => true))?.content).toBe('Replacement body');
});

it('retires a cached body when the list changes and reads current persisted content on later demand', async () => {
  const source = await snapshot();
  const reads = await prepared(source);
  prepareCompanionFlowArticle(source, '000002', '000000');
  reads.mockClear();
  await loadPreparedCompanionArticle(source, '000001', () => true);
  expect(reads.mock.calls.filter(([sql]) => sql.includes('SELECT article.*'))).toHaveLength(1);
});

it('does not use a same-ID retained body after changing database lifetime', async () => {
  const source = await snapshot();
  const reads = await prepared(source);
  invalidateCompanionReadingScope();
  reads.mockClear();
  await loadPreparedCompanionArticle(source, '000001', () => true);
  expect(reads.mock.calls.filter(([sql]) => sql.includes('SELECT article.*'))).toHaveLength(1);
});

it('keeps demand readable when a large body exceeds the bounded speculative cache', async () => {
  library.database.prepare('UPDATE nodes SET content=? WHERE id=?').run('x'.repeat(3 * 1024 * 1024), '000001');
  const source = await snapshot();
  const reads = await prepared(source);
  reads.mockClear();
  expect((await loadPreparedCompanionArticle(source, '000001', () => true))?.content.length).toBe(3 * 1024 * 1024);
  expect(reads.mock.calls.filter(([sql]) => sql.includes('SELECT article.*'))).toHaveLength(1);
});

it('does not start speculative reads while the required current body is waiting', async () => {
  const source = await snapshot();
  let release!: () => void;
  const gate = new Promise<void>(done => { release = done; });
  const blocker = getIosCompanionDatabaseOwner().readInteractiveSnapshot(() => gate);
  const reads = vi.spyOn(library.readonlyQueries, 'query');
  const current = loadPreparedCompanionArticle(source, '000000', () => true);
  prepareCompanionFlowArticle(source, '000001', '000000');
  await new Promise(done => setTimeout(done, 30));
  release(); await blocker; await current;
  await vi.waitFor(() => expect(reads.mock.calls.filter(([sql]) =>
    sql.includes('SELECT article.*')).map(([, values]) => values?.[0])).toEqual(['000000', '000001']));
});

it('falls back to the normal reader after a speculative SQLite failure', async () => {
  const source = await snapshot();
  library.database.exec('ALTER TABLE pdf_page_text RENAME TO unavailable_pdf_text');
  await prepared(source);
  library.database.exec('ALTER TABLE unavailable_pdf_text RENAME TO pdf_page_text');
  expect((await loadPreparedCompanionArticle(source, '000001', () => true))?.content).toContain('prefix alpha');
});

it('does not accept a body whose persisted version differs from the catalog', async () => {
  const source = await snapshot();
  source.nodesById['000001']!.currentVersionId = 'stale-version';
  await prepared(source);
  await expect(loadPreparedCompanionArticle(source, '000001', () => true)).rejects.toThrow('article changed');
});

it('retires an in-flight prefetch when its node leaves the list', async () => {
  const source = await snapshot();
  let release!: () => void;
  const gate = new Promise<void>(done => { release = done; });
  const blocker = getIosCompanionDatabaseOwner().readInteractiveSnapshot(() => gate);
  prepareCompanionFlowArticle(source, '000001', '000000');
  await new Promise(done => setTimeout(done, 30));
  prepareCompanionFlowArticle(source, null, '000000');
  release(); await blocker;
  await getIosCompanionDatabaseOwner().readInteractiveSnapshot(async () => null);
  const reads = vi.spyOn(library.readonlyQueries, 'query');
  expect((await loadPreparedCompanionArticle(source, '000001', () => true))?.content).toContain('prefix alpha');
  expect(reads.mock.calls.filter(([sql]) => sql.includes('SELECT article.*'))).toHaveLength(1);
});

it('prepares text independently of a missing PDF file without downloading or decoding the attachment', async () => {
  const resource = { storage_key: 'a'.repeat(64) + '.pdf', role: 'reference', original_name: 'missing.pdf' };
  library.database.prepare('UPDATE nodes SET resource_references=? WHERE id=?')
    .run(JSON.stringify([resource]), '000001');
  const source = await snapshot();
  await prepared(source);
  const article = await loadPreparedCompanionArticle(source, '000001', () => true);
  expect(article?.content).toContain('prefix alpha');
  expect(article?.pdfAttachmentId).toBe('a'.repeat(64));
});

it('loads consecutive demanded bodies while a learning writer is still uncommitted', async () => {
  const source = await snapshot();
  const owner = getIosCompanionDatabaseOwner();
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  let committed = false;
  const write = owner.runWriter(db => db.transaction(async () => {
    await db.run('UPDATE nodes SET content=? WHERE id=?', ['Uncommitted replacement', '000001']);
    entered();
    await gate;
  })).then(() => { committed = true; });
  await started;
  const results: Array<{ nodeId: string | undefined; content: string | undefined }> = [];
  const reading = (async () => {
    for (const id of ['000001', '000002']) {
      const article = await loadPreparedCompanionArticle(source, id, () => true);
      results.push({ nodeId: article?.nodeId, content: article?.content });
    }
  })();
  try {
    await vi.waitFor(() => expect(results.map(article => article.nodeId)).toEqual(['000001', '000002']));
    for (const article of results) expect(article.content).toContain('prefix alpha');
    expect(committed).toBe(false);
  } finally {
    release();
    await Promise.all([write, reading]);
  }
});

it('keeps the document and annotation catalog in one committed snapshot during concurrent writes', async () => {
  const source = await snapshot();
  const owner = getIosCompanionDatabaseOwner();
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const query = library.readonlyQueries.query.bind(library.readonlyQueries);
  vi.spyOn(library.readonlyQueries, 'query').mockImplementation(async (sql, values) => {
    const result = await query(sql, values);
    if (sql.includes('SELECT article.*')) { entered(); await gate; }
    return result;
  });
  const reading = loadPreparedCompanionArticle(source, '000001', () => true);
  try {
    await started;
    await owner.runWriter(db => db.run(`INSERT INTO nodes
      (id, parent_id, title, content, anchor_link, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['new-note', '000001', 'Note', 'prefix', JSON.stringify({ id: 'anchor', kind: 'highlight',
      locator: { from: 0, to: 6, originalText: 'prefix' } }), 'now', 'now']));
  } finally { release(); }
  expect((await reading)?.content).toContain('prefix alpha');
  await expect(loadPreparedCompanionArticle(source, '000001', () => true)).rejects.toThrow('article changed');
});

it('rejects foreground admission as soon as database closing is requested behind a writer', async () => {
  const owner = getIosCompanionDatabaseOwner();
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  const writer = owner.runWriter(async () => { entered(); await gate; });
  await started;
  const closing = owner.close();
  try {
    await expect(owner.readInteractiveSnapshot(async () => true)).rejects.toThrow('is closing');
  } finally { release(); await Promise.all([writer, closing]); }
  await expect(owner.readInteractiveSnapshot(async () => true)).rejects.toThrow('not open');
});
