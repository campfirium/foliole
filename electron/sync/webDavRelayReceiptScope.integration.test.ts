// @vitest-environment node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

import { webDavRelayStatus } from '../../lib/core/sync/webDavRelayPublication.js';
import type { RestorePeer } from '../database/requestSyncRestoreRecovery.testSupport.js';
import { assertSqlScaleInvariant } from '../database/sqlQueryBudget.testSupport.js';
import { measureSqlStatements } from '../database/sqlStatementMeter.testSupport.js';

import { edit, relayFixture, storageKey } from './webDavRelayAttachmentFixture.testSupport.js';
import { edit as editBody, stats, text, withRelayPeers } from './webDavRelayBodyRound.testSupport.js';

it('does not load historical packet receipts when the relay is empty', async () => {
  const fixture = await relayFixture();
  try {
    const target = fixture.peers[1];
    const { key } = (await fixture.scope(target.peer))!;
    const baseline = await measureSqlStatements(() => fixture.sync(target));
    await seedHistoricalReceipts(target.peer, key);
    target.peer.reopen();
    const historical = await measureSqlStatements(() => fixture.sync(target));

    expect(historical.result).toMatchObject({ applied: 0, published: 0 });
    assertSqlScaleInvariant('empty relay receive', baseline.report, historical.report);
  } finally { await fixture.close(); }
});

it('deduplicates visible packets with bounded reads and reclaims their receipts after confirmed cleanup', async () => {
  const fixture = await relayFixture();
  try {
    const [source, target] = fixture.peers;
    const bytes = Buffer.from('An image delivered before collection retirement');
    const attachment = storageKey(bytes);
    await writeFile(path.join(source.assets, attachment), bytes);
    await edit(source.peer, [attachment], 'before-retirement');
    expect(await fixture.sync(source)).toMatchObject({ published: 2 });
    expect(await fixture.sync(target)).toMatchObject({ applied: 2 });
    expect(await readFile(path.join(target.assets, attachment))).toEqual(bytes);

    const { key, incoming } = (await fixture.scope(target.peer))!;
    const receipts = () => target.peer.db.query('SELECT key FROM sync_group_metadata WHERE key >= ? AND key < ? ORDER BY key',
      [`${key}:applied:`, `${key}:applied;`]);
    expect(await receipts()).toHaveLength(2);
    const live = await measureSqlStatements(() => fixture.sync(target));
    const oldKeys = await seedHistoricalReceipts(target.peer, key);
    target.peer.reopen();
    const historical = await measureSqlStatements(() => fixture.sync(target));
    expect(historical.result).toMatchObject({ applied: 0, published: 0 });
    assertSqlScaleInvariant('relay receive with visible packets', live.report, historical.report);
    const beforeDeletion = await receipts();
    expect(beforeDeletion).toHaveLength(oldKeys.length + 2);

    expect(await fixture.lan(true, undefined, 1)).toMatchObject({ complete: true, attachments: { pending: 0 } });
    expect(fixture.dav.deletions).toContain(incoming.pathname);
    expect(await fixture.request(incoming, { method: 'PROPFIND', headers: { Depth: '0' } }, webDavRelayStatus)).toBe(404);
    target.peer.reopen();
    expect(await receipts()).toEqual(oldKeys);
    expect(await fixture.sync(target)).toMatchObject({ applied: 0 });
    expect(await readFile(path.join(target.assets, attachment))).toEqual(bytes);
  } finally { await fixture.close(); }
});

it('honors an unscoped receipt left by an older library for a still-visible packet', async () => {
  let name = '';
  await withRelayPeers(async ({ source, target, scope, sync }) => {
    await editBody(source, 'already-applied', 'Previously received body');
    expect(await sync(source)).toMatchObject({ published: 1 });
    expect(await sync(target)).toMatchObject({ applied: 1 });
    const { key } = await scope(target);
    // Represent the persisted receipt layout before collection generations were recorded.
    await target.db.transaction(async tx => {
      const scoped = await tx.run('DELETE FROM sync_group_metadata WHERE key = ?', [`${key}:applied:legacy:${name}`]);
      expect(scoped.changes).toBe(1);
      await tx.run('INSERT OR IGNORE INTO sync_group_metadata (key, value, updated_at) VALUES (?, ?, ?)',
        [`${key}:applied:${name}`, 'true', new Date().toISOString()]);
    });
    target.reopen();

    const replay = stats();
    expect(await sync(target, replay)).toMatchObject({ applied: 0 });
    expect(replay.requests.GET).toBeUndefined();
    expect(await text(target, 'already-applied')).toBe('Previously received body');
  }, (_response, request) => {
    if (!name && request.method === 'MOVE' && typeof request.headers.destination === 'string') {
      name = path.posix.basename(new URL(request.headers.destination).pathname);
    }
    return false;
  });
});

it('reclaims the responder receipts after the LAN initiator deletes its retired collection', async () => {
  const fixture = await relayFixture();
  try {
    const [source, target] = fixture.peers;
    await edit(source.peer, [fixture.old], 'legacy-before-retirement');
    expect(await fixture.sync(source)).toMatchObject({ published: 1 });
    expect(await fixture.lan()).toMatchObject({ complete: true, attachments: { pending: 0 } });

    await edit(source.peer, [fixture.old], 'scoped-before-retirement');
    expect(await fixture.sync(source)).toMatchObject({ published: 1 });
    expect(await fixture.sync(target)).toMatchObject({ applied: 1 });
    const scope = (await fixture.scope(source.peer))!;
    const { key } = (await fixture.scope(target.peer))!;
    const receipts = () => target.peer.db.query('SELECT key FROM sync_group_metadata WHERE key >= ? AND key < ?',
      [`${key}:applied:`, `${key}:applied;`]);
    expect(await receipts()).toHaveLength(1);

    fixture.rejectNextDelete();
    expect(await fixture.lan()).toMatchObject({ complete: true, attachments: { pending: 0 } });
    expect(await fixture.request(scope.outgoing, { method: 'PROPFIND', headers: { Depth: '0' } }, webDavRelayStatus)).toBe(207);
    await target.reopen();
    expect(await fixture.sync(target)).toMatchObject({ applied: 0 });
    expect(await receipts()).toHaveLength(1);

    expect(await fixture.lan()).toMatchObject({ complete: true, attachments: { pending: 0 } });
    expect(fixture.dav.deletions).toContain(scope.outgoing.pathname);
    expect(await fixture.request(scope.outgoing, { method: 'PROPFIND', headers: { Depth: '0' } }, webDavRelayStatus)).toBe(404);
    await target.reopen();
    expect(await fixture.sync(target)).toMatchObject({ applied: 0 });
    expect(await receipts()).toEqual([]);
  } finally { await fixture.close(); }
});

async function seedHistoricalReceipts(peer: RestorePeer, scopeKey: string) {
  const keys = Array.from({ length: 256 }, () =>
    `${scopeKey}:applied:20261001T120000.000Z-${crypto.randomUUID()}.dat`).sort();
  await peer.db.run(`INSERT INTO sync_group_metadata (key, value, updated_at)
    SELECT value, 'true', ? FROM json_each(?)`, [new Date().toISOString(), JSON.stringify(keys)]);
  return keys.map(key => ({ key }));
}
