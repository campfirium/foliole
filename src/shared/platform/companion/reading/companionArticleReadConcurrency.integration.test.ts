// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { loadCompanionWorkspaceSyncState } from '../../companionWorkspaceSync';
import { createSearchLibrary } from '../runtime/companionSearchSnapshot.testSupport';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

import { loadPreparedCompanionArticle } from './companionArticlePreparation';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});

let library: Awaited<ReturnType<typeof createSearchLibrary>>;
const snapshot = async () => (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
beforeEach(async () => { library = await createSearchLibrary(3, 64); });
afterEach(async () => { await library.close(); vi.restoreAllMocks(); });
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


it('reads a demanded body before an active sync snapshot finishes', async () => {
  const source = await snapshot();
  const owner = getIosCompanionDatabaseOwner();
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  let completed = false;
  const sync = owner.readSnapshot(async db => {
    await db.query('SELECT id FROM nodes LIMIT 1');
    entered();
    await gate;
  }).then(() => { completed = true; });
  await started;
  const articles: string[] = [];
  const reading = (async () => {
    for (const id of ['000001', '000002']) {
      const article = await loadPreparedCompanionArticle(source, id, () => true);
      expect(article?.content).toContain('prefix alpha');
      articles.push(article!.nodeId);
    }
  })();
  try {
    await vi.waitFor(() => expect(articles).toEqual(['000001', '000002']));
    expect(completed).toBe(false);
  } finally { release(); await Promise.all([sync, reading]); }
});

it('rejects an older borrowed document when the current catalog already contains its deletion', async () => {
  const source = await snapshot();
  const owner = getIosCompanionDatabaseOwner();
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const sync = owner.readSnapshot(async db => {
    await db.query('SELECT id FROM nodes LIMIT 1'); entered(); await gate;
  });
  await started;
  try {
    await owner.runWriter(db => db.run('UPDATE nodes SET deleted_at=? WHERE id=?', ['now', '000001']));
    source.nodesById['000001'] = { ...source.nodesById['000001']!, deletedAt: 'now' };
    await expect(loadPreparedCompanionArticle(source, '000001', () => true)).rejects.toThrow('article changed');
  } finally { release(); await sync; }
  await expect(loadPreparedCompanionArticle(source, '000001', () => true)).resolves.toBeNull();
});
