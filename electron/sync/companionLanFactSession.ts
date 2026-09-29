import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import { decodeSyncPackFactClaims, parentFactKey, type SyncPackFactIndex
} from '../../lib/core/sync/syncPackFactPresence.js';
import { openDatabaseConnection } from '../database/connection.js';
import {
  readDesktopSyncPackFactPage, selectDesktopSyncPackFactWindow,
  type DesktopSyncPackFactWindow, type SyncPackFactPosition
} from '../database/syncPackFactPage.js';
import { createSyncPackSourceView, openSyncPackSourceView } from '../database/syncPackSourceView.js';

import { sessionRoot } from './companionLanDependencySession.js';

interface FactSession {
  toPeerId: string;
  window: DesktopSyncPackFactWindow;
}

interface FactProgress {
  current_index_id: string;
  last_index_id: string | null;
  last_bits: string | null;
  after_kind: SyncPackFactPosition['kind'] | null;
  after_key: string | null;
  after_ordinal: number | null;
  completed: number;
}

export async function createCompanionFactSession(args: {
  groupId: string; toPeerId: string; window: DesktopSyncPackFactWindow;
}) {
  const base = sessionRoot(args.groupId, args.toPeerId);
  await fs.mkdir(base, { recursive: true });
  const staging = await fs.mkdtemp(path.join(base, '.preparing-'));
  let view: Awaited<ReturnType<typeof createSyncPackSourceView>> | undefined;
  try {
    view = await createSyncPackSourceView(openDatabaseConnection().sqlite,
      path.join(staging, 'source.db'));
    if (view.frontierStateSeq !== args.window.frontierStateSeq) {
      throw new Error('sync_pack_source_view_unavailable');
    }
    const window = selectDesktopSyncPackFactWindow(view.driver, args.window);
    if (window.toStateSeq !== args.window.toStateSeq) throw new Error('sync_pack_fact_window_changed');
    const session: FactSession = { toPeerId: args.toPeerId, window };
    await fs.writeFile(path.join(staging, 'fact-session.json'), JSON.stringify(session), { mode: 0o600 });
    const claims = new Database(path.join(staging, 'fact-claims.db'));
    try {
      claims.exec(`CREATE TABLE progress (singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
        current_index_id TEXT NOT NULL, last_index_id TEXT, last_bits TEXT,
        after_kind TEXT, after_key TEXT, after_ordinal INTEGER, completed INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE known_facts (kind TEXT NOT NULL, fact_key TEXT NOT NULL,
        fact_json TEXT NOT NULL, PRIMARY KEY (kind, fact_key))`);
      const first = readDesktopSyncPackFactPage(view.driver, window);
      claims.prepare('INSERT INTO progress (singleton_id, current_index_id) VALUES (1, ?)')
        .run(first.index.index_id);
    } finally { claims.close(); }
    await fs.chmod(path.join(staging, 'fact-claims.db'), 0o600);
    view.close();
    await fs.rename(staging, path.join(base, view.sourceViewId));
    return openCompanionFactSession(args.groupId, args.toPeerId, view.sourceViewId);
  } finally {
    try { view?.close(); } catch { /* Closed before publication. */ }
    await fs.rm(staging, { recursive: true, force: true });
  }
}

export async function openCompanionFactSession(groupId: string, peerId: string, viewId: string) {
  if (!/^[a-f0-9-]{36}$/u.test(viewId)) throw new Error('sync_pack_source_view_invalid');
  const root = path.join(sessionRoot(groupId, peerId), viewId);
  let session: FactSession;
  try { session = JSON.parse(await fs.readFile(path.join(root, 'fact-session.json'), 'utf8')) as FactSession; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('sync_pack_source_view_unavailable');
    throw error;
  }
  if (session.toPeerId !== peerId) throw new Error('sync_pack_source_view_changed');
  const sourcePath = path.join(root, 'source.db');
  try { await Promise.all([fs.access(sourcePath), fs.access(path.join(root, 'fact-claims.db'))]); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('sync_pack_source_view_unavailable');
    throw error;
  }
  const view = openSyncPackSourceView(sourcePath);
  if (view.sourceViewId !== viewId || view.sourceEpoch !== session.window.sourceEpoch ||
      view.frontierStateSeq !== session.window.frontierStateSeq) {
    view.close();
    throw new Error('sync_pack_source_view_changed');
  }
  view.driver.execute('ATTACH DATABASE ? AS fact_claims', [path.join(root, 'fact-claims.db')]);
  return { ...session, view };
}

export async function readCompanionFactSessionPage(args: {
  groupId: string; peerId: string; viewId: string; previousIndexId?: string;
  claimBits?: { versions: string; parents: string; reviews: string };
}) {
  const session = await openCompanionFactSession(args.groupId, args.peerId, args.viewId);
  const claims = new Database(path.join(sessionRoot(args.groupId, args.peerId), args.viewId,
    'fact-claims.db'), { fileMustExist: true });
  try { return claims.transaction(() => readClaimedFactPage(session, claims, args))(); }
  finally { claims.close(); session.view.close(); }
}

function readClaimedFactPage(session: Awaited<ReturnType<typeof openCompanionFactSession>>,
  claims: Database.Database, args: Parameters<typeof readCompanionFactSessionPage>[0]) {
  const progress = claims.prepare('SELECT * FROM progress WHERE singleton_id = 1').get() as FactProgress;
  const after = progress.after_kind ? { kind: progress.after_kind,
    key: progress.after_key!, ordinal: progress.after_ordinal! } : undefined;
  if (args.previousIndexId) {
    if (!args.claimBits) throw new Error('sync_pack_fact_claims_invalid');
    const bits = JSON.stringify(args.claimBits);
    if (args.previousIndexId === progress.last_index_id && bits === progress.last_bits) {
      // A response can be lost after its claims were committed.
    } else if (args.previousIndexId === progress.current_index_id) {
      if (progress.completed) throw new Error('sync_pack_fact_page_not_contiguous');
      const current = readDesktopSyncPackFactPage(session.view.driver, session.window, after);
      if (current.index.index_id !== args.previousIndexId) throw new Error('sync_pack_fact_index_changed');
      storeKnownFacts(claims, current.index, args.claimBits);
      const next = current.next;
      const nextPage = current.complete ? null :
        readDesktopSyncPackFactPage(session.view.driver, session.window, next!);
      claims.prepare(`UPDATE progress SET current_index_id = ?, last_index_id = ?, last_bits = ?,
        after_kind = ?, after_key = ?, after_ordinal = ?, completed = ? WHERE singleton_id = 1`)
        .run(nextPage?.index.index_id ?? current.index.index_id, current.index.index_id,
          bits, next?.kind ?? null, next?.key ?? null, next?.ordinal ?? null,
          current.complete ? 1 : 0);
    } else {
      throw new Error('sync_pack_fact_page_not_contiguous');
    }
  } else if (args.claimBits) {
    throw new Error('sync_pack_fact_page_not_contiguous');
  }
  const latest = claims.prepare('SELECT * FROM progress WHERE singleton_id = 1').get() as FactProgress;
  if (latest.completed) return { source_view_id: args.viewId, complete: true, ready: true,
    from_state_seq: session.window.fromStateSeq, to_state_seq: session.window.toStateSeq,
    frontier_state_seq: session.window.frontierStateSeq, source_epoch: session.window.sourceEpoch };
  const latestAfter = latest.after_kind ? { kind: latest.after_kind,
    key: latest.after_key!, ordinal: latest.after_ordinal! } : undefined;
  return { source_view_id: args.viewId,
    ...readDesktopSyncPackFactPage(session.view.driver, session.window, latestAfter) };
}

function storeKnownFacts(claims: Database.Database, index: SyncPackFactIndex,
  bits: { versions: string; parents: string; reviews: string }) {
  const held = decodeSyncPackFactClaims(index, bits);
  const insert = claims.prepare(`INSERT OR IGNORE INTO known_facts (kind, fact_key, fact_json)
    VALUES (?, ?, ?)`);
  const keys = { versions: (fact: SyncPackFactIndex['versions'][number]) => fact.version_id,
    parents: parentFactKey, reviews: (fact: SyncPackFactIndex['reviews'][number]) => fact.op_id };
  for (const fact of index.versions) if (held.versions.includes(keys.versions(fact))) {
    insert.run('versions', keys.versions(fact), JSON.stringify(fact));
  }
  for (const fact of index.parents) if (held.parents.includes(keys.parents(fact))) {
    insert.run('parents', keys.parents(fact), JSON.stringify(fact));
  }
  for (const fact of index.reviews) if (held.reviews.includes(keys.reviews(fact))) {
    insert.run('reviews', keys.reviews(fact), JSON.stringify(fact));
  }
}
