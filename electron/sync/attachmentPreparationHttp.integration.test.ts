// @vitest-environment node
import path from 'node:path';

import { expect, it, vi } from 'vitest';

const sandbox = vi.hoisted(() => ({ root: '' }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] }, app: {
  getPath: (name: string) => `${sandbox.root}/host/${name}`, isPackaged: false
} }));

import { parseChangedAttachmentArticles, readAttachmentArticles } from '../../lib/core/sync/attachmentDemandPreparation.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readRequestSyncInventorySnapshot } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { withRequestSyncAttachmentPreparation } from '../../lib/core/sync/requestSyncAttachmentPreparation.js';
import { transferRequestSyncBatch } from '../../lib/core/sync/requestSyncBatchExchange.js';
import { exchangeRequestSyncInventory } from '../../lib/core/sync/requestSyncDatabaseExchange.js';
import { runRequestSyncDatabaseRound } from '../../lib/core/sync/requestSyncDatabaseRound.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';
import * as snapshots from '../database/requestSyncReadonlySnapshot.js';
import { textBranch } from '../database/topicTextState.testSupport.js';

import { imageBody, imageKey } from './attachmentDemandQueue.testSupport.js';
import { deferred, peerState, preparationHttpFixture } from './attachmentPreparationHttp.testSupport.js';

it('prepares committed demand while final inventory is paused, without starting attachment requests', async () => {
  sandbox.root = path.resolve('.tmp/artifacts/T626/early-http');
  const f = await preparationHttpFixture(sandbox.root);
  try {
    await f.target.write(db => applyConvergentSyncNodesWithDbPort(db, [textBranch('v1', imageBody(imageKey(1)))]));
    const prepared = deferred();
    const host = { ...f.host, write: <T>(write: (db: DbPort) => Promise<T>) => f.host.write(async db => {
      const value = await write(db);
      if ((await db.query('SELECT 1 FROM attachment_pending')).length) prepared.resolve();
      return value;
    }) };
    let transferred = false;
    const result = await withRequestSyncAttachmentPreparation(host, undefined, database => runRequestSyncDatabaseRound({
      exchangeInventory: async () => {
        if (transferred) {
          await prepared.promise;
          expect(await f.sourceDb.query('SELECT storage_key FROM attachment_pending')).toEqual([{ storage_key: imageKey(1) }]);
        }
        return exchangeRequestSyncInventory(database, f.exchange);
      },
      transferObjects: async differences => {
        const result = await transferRequestSyncBatch(database, f.exchange, differences, { peerState: peerState('local') });
        transferred = true; return result;
      }, reportObjectError: (_difference, error) => { throw error; }
    }));
    expect(result.complete).toBe(true);
    for (const database of [f.host, f.target]) {
      expect(await database.readSnapshot(db => db.query("SELECT content, current_version_id FROM nodes WHERE id = 'topic'")))
        .toEqual([{ content: imageBody(imageKey(1)), current_version_id: 'v1' }]);
    }
    expect(await f.host.readSnapshot(db => readAttachmentArticles(db, ['topic']))).toEqual([]);
  } finally { await f.close(); }
});

it('receives a later batch while the first committed snapshot has not finished preparing', async () => {
  sandbox.root = path.resolve('.tmp/artifacts/T626/pipeline-http');
  const f = await preparationHttpFixture(sandbox.root);
  const release = deferred();
  try {
    const records = [1, 2].map(i => ({ ...textBranch(`v${i}`, imageBody(imageKey(i))), object_id: `article-${i}`,
      snapshot: { ...textBranch(`v${i}`, imageBody(imageKey(i))).snapshot, id: `article-${i}` } }));
    await f.target.write(db => applyConvergentSyncNodesWithDbPort(db, records));
    const started = deferred();
    let reads = 0;
    const host = { ...f.host, readSnapshot: async <T>(read: (db: DbPort) => Promise<T>, signal?: AbortSignal) => {
      const result = await f.host.readSnapshot(read, signal);
      if (++reads === 1) { started.resolve(); await release.promise; }
      return result;
    } };
    const remote = await f.target.readSnapshot(readRequestSyncInventorySnapshot);
    await withRequestSyncAttachmentPreparation(host, undefined, async database => {
      for (const [index, difference] of compareFramedSyncInventories({ local: [], remote })
        .filter(entry => entry.globalId.startsWith('article-')).entries()) {
        const results = await transferRequestSyncBatch(database, f.exchange,
          [difference], { peerState: peerState('local') });
        expect(results[0]?.error).toBe('');
        if (!index) await started.promise;
      }
      expect(await f.sourceDb.query("SELECT id FROM nodes WHERE id LIKE 'article-%' ORDER BY id"))
        .toEqual([{ id: 'article-1' }, { id: 'article-2' }]);
      expect(await f.sourceDb.query('SELECT * FROM attachment_pending')).toEqual([]);
      release.resolve();
    });
    expect(await f.sourceDb.query('SELECT storage_key FROM attachment_pending ORDER BY storage_key'))
      .toEqual([1, 2].map(i => ({ storage_key: imageKey(i) })));
  } finally { release.resolve(); await f.close(); }
});

it.each(['signature', 'encrypted-frame'] as const)('rejects unauthenticated %s without installing body demand', async invalid => {
  sandbox.root = path.resolve(`.tmp/artifacts/T626/reject-${invalid}`);
  const f = await preparationHttpFixture(sandbox.root);
  try {
    await applyConvergentSyncNodesWithDbPort(f.sourceDb, [textBranch('untrusted', imageBody(imageKey(9)))]);
    const local = await f.host.readSnapshot(readRequestSyncInventorySnapshot);
    const difference = compareFramedSyncInventories({ local, remote: [] }).filter(entry => entry.globalId === 'topic');
    const { createDesktopRequestSyncExchange } = await import('./desktopRequestSyncExchange.js');
    const exchange = createDesktopRequestSyncExchange({ ...f.exchangeOptions,
      groupKey: invalid === 'encrypted-frame' ? new Uint8Array(32).fill(8) : f.exchange.groupKey,
      groupSecret: invalid === 'signature' ? Buffer.alloc(32, 8).toString('base64url') : f.exchangeOptions.groupSecret });
    await expect(transferRequestSyncBatch(f.host, exchange, difference, { peerState: peerState('local') })).rejects.toThrow();
    expect(await f.target.readSnapshot(db => db.query("SELECT id FROM nodes WHERE id = 'topic'"))).toEqual([]);
    expect(await f.target.readSnapshot(db => db.query("SELECT * FROM attachment_pending WHERE article_id = 'topic'"))).toEqual([]);
    expect(await f.target.readSnapshot(db => db.query("SELECT * FROM attachment_parse_queue WHERE article_id = 'topic'"))).toEqual([]);
  } finally { await f.close(); }
});

it('prepares only the adopted conflict result and never the received alternative', async () => {
  sandbox.root = path.resolve('.tmp/artifacts/T626/conflict-http');
  const f = await preparationHttpFixture(sandbox.root);
  try {
    const base = textBranch('base', 'First\n\nMiddle\n\nLast');
    const local = textBranch('local', `${imageBody(imageKey(1))}\n\n${imageBody(imageKey(2))}\n\nLast`, base);
    const remote = textBranch('remote', `First\n\nMiddle\n\n${imageBody(imageKey(9))}`, base);
    await applyConvergentSyncNodesWithDbPort(f.sourceDb, [base, local]);
    await parseChangedAttachmentArticles(f.host, () => false);
    await f.target.write(db => applyConvergentSyncNodesWithDbPort(db, [base, remote]));
    const differences = compareFramedSyncInventories({ local: await f.host.readSnapshot(readRequestSyncInventorySnapshot),
      remote: await f.target.readSnapshot(readRequestSyncInventorySnapshot) });
    const pull = differences.filter(value => value.globalId === 'topic' && value.direction === 'remote_to_local');
    expect(pull).toHaveLength(1);
    await withRequestSyncAttachmentPreparation(f.host, undefined, host =>
      transferRequestSyncBatch(host, f.exchange, pull, { peerState: peerState('local') }));
    expect((await f.sourceDb.query<{ content: string }>("SELECT content FROM nodes WHERE id = 'topic'"))[0]?.content)
      .not.toContain(imageKey(9));
    expect(await f.sourceDb.query('SELECT storage_key FROM attachment_pending ORDER BY storage_key'))
      .toEqual([1, 2].map(i => ({ storage_key: imageKey(i) })));
  } finally { await f.close(); }
});

it('acknowledges pushed batches before preparation completes, sharing the existing inbound lifecycle', async () => {
  sandbox.root = path.resolve('.tmp/artifacts/T626/push-pipeline-http');
  const f = await preparationHttpFixture(sandbox.root);
  const release = deferred(); const started = deferred();
  const original = snapshots.withRequestSyncReadonlySnapshot;
  const pause = vi.spyOn(snapshots, 'withRequestSyncReadonlySnapshot').mockImplementation(async (file, read, signal) => {
    let preparation = false;
    const result = await original(file, db => read({ ...db, query: (sql, params) => {
      if (sql.includes('FROM attachment_parse_queue q')) preparation = true;
      return db.query(sql, params);
    } }), signal);
    if (preparation) { started.resolve(); await release.promise; }
    return result;
  });
  const { createSyncPeerRoundOwnership } = await import('../../lib/core/sync/syncPeerRoundOwnership.js');
  const { withRequestSyncPeerRound } = await import('../../lib/core/sync/requestSyncPeerRound.js');
  const { createDesktopRequestSyncExchange } = await import('./desktopRequestSyncExchange.js');
  const owner = createSyncPeerRoundOwnership(60_000);
  const id = crypto.randomUUID();
  const lease = owner.acquireOutbound('local', id)!;
  const round = { id, lease, admitted: false };
  const exchange = createDesktopRequestSyncExchange({ ...f.exchangeOptions, peerRound: round });
  try {
    const records = [1, 2].map(i => {
      const record = textBranch(`push-v${i}`, imageBody(imageKey(i)));
      return { ...record, object_id: `push-${i}`, snapshot: { ...record.snapshot, id: `push-${i}` } };
    });
    await applyConvergentSyncNodesWithDbPort(f.sourceDb, records);
    const differences = compareFramedSyncInventories({ local: await f.host.readSnapshot(readRequestSyncInventorySnapshot), remote: [] })
      .filter(value => value.globalId.startsWith('push-'));
    await withRequestSyncPeerRound(exchange, round, async () => {
      for (const [index, difference] of differences.entries()) {
        expect((await transferRequestSyncBatch(f.host, exchange, [difference], { peerState: peerState('local') }))[0]?.error).toBe('');
        if (!index) await started.promise;
      }
      expect(await f.target.readSnapshot(db => db.query("SELECT id FROM nodes WHERE id LIKE 'push-%' ORDER BY id")))
        .toEqual([{ id: 'push-1' }, { id: 'push-2' }]);
      expect(await f.target.readSnapshot(db => db.query("SELECT * FROM attachment_pending WHERE article_id LIKE 'push-%'"))).toEqual([]);
      release.resolve();
    });
    expect(await f.target.readSnapshot(db => db.query("SELECT storage_key FROM attachment_pending WHERE article_id LIKE 'push-%' ORDER BY storage_key")))
      .toEqual([1, 2].map(i => ({ storage_key: imageKey(i) })));
  } finally { release.resolve(); pause.mockRestore(); owner.close(); await f.close(); }
});
