// @vitest-environment node
import { expect, it, vi } from 'vitest';

import type { DbParams, DbPort, DbRow } from '../../../../../lib/core/sync/dbPort';

import { companionNodeSqliteLibrary } from './companionNodeSqlite.testSupport';
import { loadCompanionSearchSnapshot } from './companionSearchSnapshot';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('./companionNativeSync.testSupport');
  return {
    Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false },
    registerPlugin: createCompanionNativeSyncStub
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
  owner.readSnapshot = (task, signal) => snapshot(wrap(task), signal);
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
