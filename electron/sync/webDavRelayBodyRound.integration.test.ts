// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { INSERT_REVIEW_EVENT_SQL } from '../../lib/core/database/reviewLogRecord.js';
import { applyReviewGrade } from '../../lib/core/database/reviewMutations.js';
import { recomputeNodeReviewWithDb } from '../../lib/core/database/reviewProjection.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { readWebDavRelayBodyOutbox } from '../../lib/core/sync/webDavRelayBodyOutbox.js';
import { runWebDavRelayBodyRound } from '../../lib/core/sync/webDavRelayBodyRound.js';
import { readWebDavRelayBodyScope } from '../../lib/core/sync/webDavRelayBodyScope.js';
import { webDavRelayStatus } from '../../lib/core/sync/webDavRelayPublication.js';
import { COMPANION_DATABASE_VERSION } from '../../lib/platform/nativeCompanionContract.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';
import { restoreFixture, type RestorePeer } from '../database/requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from '../database/topicTextState.testSupport.js';

import { createDesktopWebDavRelayHttp, type DesktopWebDavRelayHttpStats } from './desktopWebDavRelayHttp.js';
import { runWebDavTestLanRound, webDavTestGroupKey } from './webDavRelayLan.testSupport.js';
import { setupDav } from './webDavRelayTransport.testSupport.js';

it('recovers the same publication after reopening, exchanges bodies both ways and resumes LAN', async () => {
  await withRelayPeers(async ({ source, target, scope, sync, dav }) => {
    await edit(source, 'mac', 'first Mac body');
    const directStats = stats();
    expect(await sync(source, directStats, true)).toMatchObject({ published: 0 });
    expect(directStats.requests).not.toHaveProperty('PUT');

    dav.dropNextMove();
    await expect(sync(source)).rejects.toThrow();
    const pending = await readWebDavRelayBodyOutbox(source.db, await scope(source));
    expect(pending.packet).not.toBeNull();
    await edit(source, 'mac-later', 'later Mac body');
    source.reopen();
    expect(await readWebDavRelayBodyOutbox(source.db, await scope(source))).toEqual(pending);
    const retried = stats();
    expect(await sync(source, retried)).toMatchObject({ retries: 1, published: 2 });
    expect(retried.requests.PUT).toBe(1);

    await edit(target, 'phone', 'first phone body');
    expect(await sync(target)).toMatchObject({ applied: 2 });
    target.reopen();
    expect(await text(target, 'mac')).toBe('first Mac body');
    expect(await text(target, 'mac-later')).toBe('later Mac body');
    expect(await sync(target)).toMatchObject({ applied: 0 });
    expect(await sync(source)).toMatchObject({ applied: expect.any(Number) });
    source.reopen();
    expect(await text(source, 'phone')).toBe('first phone body');
    expect(await runWebDavTestLanRound(source, target)).toMatchObject({ complete: true, transferred: 0 });
  });
});

it('checks DAV after six hours, keeps local edits queued, and persists received content across reopen', async () => {
  await withRelayPeers(async ({ source, target, sync }) => {
    const start = Date.now();
    const sixHours = 6 * 60 * 60 * 1000;
    const now = vi.spyOn(Date, 'now').mockReturnValue(start + sixHours - 10_000);
    try {
      await edit(source, 'desktop-update', 'Desktop update');
      await sync(source);
      await edit(target, 'local-pending', 'Pending local update');
      target.reopen();

      const tooSoon = stats();
      await sync(target, tooSoon, false, true);
      expect(tooSoon.requests).toEqual({});
      expect(await text(target, 'desktop-update')).toBeUndefined();

      now.mockReturnValue(start + sixHours + 1);
      expect(await sync(target, stats(), false, true)).toMatchObject({ applied: 1, published: 0 });
      target.reopen();
      expect(await text(target, 'desktop-update')).toBe('Desktop update');
      const fresh = stats();
      await sync(target, fresh, false, true);
      expect(fresh.requests).toEqual({});
      expect(await sync(target)).toMatchObject({ published: 1 });
    } finally { now.mockRestore(); }
  });
});

it.each(['LAN', 'DAV'])('converges shared grades with %s arriving first and keeps each daily list', async first => {
  await withRelayPeers(async ({ source, target, sync }) => {
    const sourceList = seedDailyList(source, 10, 'queue');
    const targetList = seedDailyList(target, 20, 'soon');
    await gradeBothPeers(source, target);

    const lan = async () => expect(await runWebDavTestLanRound(source, target)).toMatchObject({ complete: true });
    if (first === 'LAN') await lan();
    expect(await sync(source)).toMatchObject({ published: 1 });
    expect(await sync(target)).toMatchObject({ published: 1, applied: 1 });
    expect(await sync(source)).toMatchObject({ applied: 1 });
    if (first === 'DAV') await lan();
    await sync(target);
    expect(await sync(target)).toMatchObject({ applied: 0, published: 0 });
    expect(await sync(source)).toMatchObject({ applied: 0, published: 0 });

    source.reopen();
    target.reopen();
    for (const [peer, list] of [[source, sourceList], [target, targetList]] as const) {
      expect(peer.sqlite.prepare('SELECT op_id, grade FROM review_log ORDER BY op_id').all())
        .toEqual([{ op_id: 'mac-grade', grade: 3 }, { op_id: 'phone-grade', grade: 4 }]);
      expect(peer.sqlite.prepare("SELECT reps FROM node_review WHERE node_id = 'shared'").pluck().get()).toBe(2);
      expect(peer.sqlite.prepare('SELECT * FROM daily_flow_entries').all()).toEqual(list);
      expect(peer.sqlite.prepare("SELECT current_version_id FROM nodes WHERE id = 'shared'").pluck().get())
        .toBe('shared-head');
    }
  });
});

it('relays grades entered on old libraries after their existing LAN baseline', async () => {
  await withRelayPeers(async ({ source, target, sync }) => {
    for (const [peer, previous] of [[source, 186], [target, 114]] as const) {
      peer.sqlite.exec(`DROP TRIGGER trg_webdav_relay_review_insert;
        DROP TRIGGER trg_webdav_relay_review_delete;
        DROP TABLE webdav_relay_review_sequence;
        PRAGMA user_version = ${previous}`);
    }
    await gradeBothPeers(source, target);
    initializeDatabaseSchema(source.sqlite);
    await target.db.transaction(tx => migrateCompanionDatabase(tx, 114, COMPANION_DATABASE_VERSION));
    expect(await sync(source)).toMatchObject({ published: 1 });
    expect(await sync(target)).toMatchObject({ published: 1, applied: 1 });
    expect(await sync(source)).toMatchObject({ applied: 1 });
    source.reopen();
    target.reopen();
    for (const peer of [source, target]) {
      expect(peer.sqlite.prepare('SELECT op_id FROM review_log ORDER BY op_id').pluck().all())
        .toEqual(['mac-grade', 'phone-grade']);
    }
  });
});

function seedDailyList(peer: RestorePeer, position: number, cohort: string) {
  peer.sqlite.prepare('INSERT INTO daily_flow_entries VALUES (?, ?, 1, ?, 1, 0)').run('shared', position, cohort);
  return peer.sqlite.prepare('SELECT * FROM daily_flow_entries').all();
}

async function gradeBothPeers(source: RestorePeer, target: RestorePeer) {
  const at = '2026-10-01T12:00:00.000Z';
  const card = { due: at, last_review: at, state: 2 as const, stability: 1, difficulty: 2,
    elapsed_days: 0, scheduled_days: 1, reps: 1, lapses: 0 };
  applyReviewGrade(createBetterSqlite3Driver(source.sqlite), {
    nodeId: 'shared', opId: 'mac-grade', grade: 3, reviewedAt: at,
    schedulerVersion: 'test', cardBefore: card, cardAfter: card
  }, { hostName: source.id, createId: () => 'mac-grade-row' });
  await target.db.transaction(async tx => {
    await tx.run(INSERT_REVIEW_EVENT_SQL, ['phone-grade-row', 'phone-grade', target.id, 'shared',
      4, 'test', '2026-10-02T12:00:00.000Z', 'review', null]);
    await recomputeNodeReviewWithDb(tx, 'shared');
  });
}

async function withRelayPeers(run: (fixture: { source: RestorePeer; target: RestorePeer; dav: ReturnType<typeof setupDav>;
  scope(peer: RestorePeer): Promise<NonNullable<Awaited<ReturnType<typeof readWebDavRelayBodyScope>>>>;
  sync(peer: RestorePeer, http?: DesktopWebDavRelayHttpStats, lanConnected?: boolean, foregroundReceive?: boolean):
    ReturnType<typeof runWebDavRelayBodyRound>;
}) => Promise<void>) {
  const fixture = await restoreFixture();
  const upstream = process.env.FOLIOLE_TEST_WEBDAV_URL;
  const dav = setupDav(upstream);
  await new Promise<void>(resolve => dav.server.listen(0, '127.0.0.1', resolve));
  try {
    const source = fixture.peer('source');
    const target = await fixture.companionPeer('target');
    const address = dav.server.address();
    if (!address || typeof address === 'string') throw new Error('webdav_fixture_address_missing');
    const directory = new URL(`http://127.0.0.1:${address.port}${dav.sandboxPath}${crypto.randomUUID()}/`);
    await createDesktopWebDavRelayHttp(stats())(directory, { method: 'MKCOL' }, webDavRelayStatus);
    const binding = { id: crypto.randomUUID(), group_id: 'group', desktop_device_id: source.id,
      phone_device_id: target.id, directory_url: directory.href };
    await establishBaseline(source, target, binding);

    const scope = async (peer: RestorePeer) => {
      const result = await readWebDavRelayBodyScope(peer.db, binding, peer.id);
      if (!result) throw new Error('test_baseline_missing');
      return result;
    };
    const sync = async (peer: RestorePeer, http = stats(), lanConnected = false, foregroundReceive = false) => runWebDavRelayBodyRound({
      host: { ...peer.host, enqueueSearchInvalidations: peer.desktop }, files: peer.host.files,
      request: createDesktopWebDavRelayHttp(http), scope: await scope(peer), groupKey: webDavTestGroupKey,
      foregroundReceive, lanConnected: () => lanConnected, assertScope: async () => { await scope(peer); },
      progress: { published: 0, applied: 0, retries: 0 }
    });

    await run({ source, target, scope, sync, dav });
  } finally {
    await new Promise<void>(resolve => dav.server.close(() => resolve()));
    await fixture.close();
  }
}

async function establishBaseline(source: RestorePeer, target: RestorePeer,
  binding: Parameters<typeof readWebDavRelayBodyScope>[1]) {
  const shared = textBranch('shared-head', 'Shared review material');
  await applySyncNodesWithDbPort(source.db, [{ ...shared, object_id: 'shared',
    snapshot: { ...shared.snapshot, id: 'shared', kind: 'item' } }]);
  expect(await runWebDavTestLanRound(source, target, binding)).toMatchObject({ complete: true });
  for (const [local, remote] of [[source, target], [target, source]] as const) {
    await local.db.run('INSERT OR IGNORE INTO node_version_device_revisions VALUES (?, ?, ?, 0, ?, NULL, ?)',
      ['group', remote.id, remote.epoch, 'baseline', new Date().toISOString()]);
  }
}

function stats(): DesktopWebDavRelayHttpStats {
  return { requests: {}, responses: 0, uploadedBytes: 0, downloadedBytes: 0 };
}

async function edit(peer: RestorePeer, id: string, body: string) {
  const branch = textBranch(`${id}-version`, body);
  await applySyncNodesWithDbPort(peer.db, [{ ...branch, object_id: id, snapshot: { ...branch.snapshot, id } }],
    { enqueueSearchInvalidations: peer.desktop, operation: 'local_mutation' });
}

async function text(peer: RestorePeer, id: string) {
  return (await peer.db.query<{ content: string }>('SELECT content FROM nodes WHERE id = ?', [id]))[0]?.content;
}
