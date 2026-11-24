// @vitest-environment node
import { expect, it, vi } from 'vitest';

import type { DbParams, DbPort, DbRow } from '../../../../../lib/core/sync/dbPort';
import { handoffCompanionArticle } from '../reading/companionArticleHandoff';

import { companionNodeSqliteLibrary } from './companionNodeSqlite.testSupport';
import { loadCompanionSearchSnapshot } from './companionSearchSnapshot';

const clipboard = vi.hoisted(() => vi.fn());
vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('./companionNativeSync.testSupport');
  return {
    Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true,
      isPluginAvailable: (name: string) => name === 'FolioleCompanionBootstrap' },
    registerPlugin: () => ({ ...createCompanionNativeSyncStub(), writeClipboardText: clipboard })
  };
});

type Owner = Awaited<ReturnType<ReturnType<typeof companionNodeSqliteLibrary>['open']>>;

function pauseAfterFirstSearchQuery(owner: Owner) {
  let resume!: () => void;
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const hold = new Promise<void>(resolve => { resume = resolve; });
  const read = owner.read.bind(owner);
  const snapshot = owner.readSnapshot.bind(owner);
  const queries: string[] = [];
  const wrap = <T>(task: (db: DbPort) => Promise<T>) => (db: DbPort) => task({
    ...db,
    async query<U extends DbRow>(sql: string, params?: DbParams) {
      const rows = await db.query<U>(sql, params);
      if (sql.includes(' FROM (')) {
        queries.push(sql);
        if (queries.length === 1) { entered(); await hold; }
      }
      return rows;
    }
  });
  owner.read = task => read(wrap(task));
  owner.readSnapshot = (task, signal, options) => snapshot(wrap(task), signal, options);
  return { started, resume, queries };
}

it('allows a write to commit while all search categories keep the same SQLite snapshot', async () => {
  const library = companionNodeSqliteLibrary();
  try {
    const owner = await library.open();
    await owner.runWriter(async db => {
      await db.run("INSERT INTO nodes (id,title,content,created_at,updated_at) VALUES ('old','Alpha','alpha','now','now')");
      await db.run("INSERT INTO pdf_page_text (attachment_id,page,text) VALUES ('pdf',1,'alpha')");
    }, { kind: 'business' });
    const paused = pauseAfterFirstSearchQuery(owner);
    const search = loadCompanionSearchSnapshot('alpha');
    await paused.started;
    let wrote = false;
    const writing = owner.runWriter(db => db.run('DELETE FROM pdf_page_text WHERE page = 1'), { kind: 'business' })
      .then(() => { wrote = true; });
    try { await vi.waitFor(() => expect(wrote).toBe(true), { timeout: 1000 }); }
    finally { paused.resume(); await Promise.all([search, writing]); }

    const stable = await search;
    expect(stable.topics.map(row => row.id)).toEqual(['old']);
    expect(stable.pdf.map(row => row.page)).toEqual([1]);
    expect((await loadCompanionSearchSnapshot('alpha')).pdf).toEqual([]);
  } finally { await library.dispose(); }
});

it('abandons subsequent SQL categories when the search is superseded', async () => {
  const library = companionNodeSqliteLibrary();
  try {
    const owner = await library.open();
    const paused = pauseAfterFirstSearchQuery(owner);
    const controller = new AbortController();
    const first = loadCompanionSearchSnapshot('alpha', controller.signal);
    const cancelled = expect(first).rejects.toThrow('obsolete search');
    await paused.started;
    controller.abort(new Error('obsolete search'));
    paused.resume();
    await cancelled;
    expect(paused.queries).toHaveLength(1);
    await expect(loadCompanionSearchSnapshot('beta')).resolves.toMatchObject({ topics: [], pdf: [], external: [] });
  } finally { await library.dispose(); }
});

it('copies the committed article body even while a search holds an older snapshot', async () => {
  const library = companionNodeSqliteLibrary();
  try {
    const owner = await library.open();
    await owner.runWriter(db => db.run(
      "INSERT INTO nodes (id,title,content,created_at,updated_at) VALUES ('article','Article','alpha original','now','now')"
    ), { kind: 'business' });
    const paused = pauseAfterFirstSearchQuery(owner);
    const search = loadCompanionSearchSnapshot('alpha');
    await paused.started;
    try {
      await owner.runWriter(db => db.run("UPDATE nodes SET content='alpha committed' WHERE id='article'"), { kind: 'business' });
      let entered!: () => void;
      const reading = new Promise<void>(resolve => { entered = resolve; });
      const read = owner.readInteractiveSnapshot.bind(owner);
      owner.readInteractiveSnapshot = (task, signal) => {
        const result = read(task, signal);
        entered();
        return result;
      };
      const copy = handoffCompanionArticle({ nodeId: 'article', mode: 'copy', flush: async () => {}, isCurrent: () => true });
      await reading;
      paused.resume();
      expect(await copy).toEqual({ status: 'presented' });
      expect(clipboard).toHaveBeenCalledWith({ text: expect.stringContaining('alpha committed') });
    } finally { paused.resume(); await search; }
  } finally { await library.dispose(); }
});
