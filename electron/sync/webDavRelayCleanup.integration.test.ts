// @vitest-environment node
import { readFile, rename, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

import type { DbRow } from '../../lib/core/sync/dbPort.js';
import { beginSyncGroupLocalAdoption } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import { hasWebDavRelayPublishedChanges } from '../../lib/core/sync/webDavRelayBodyOutbox.js';
import { webDavRelayStatus } from '../../lib/core/sync/webDavRelayPublication.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';
import { resetSyncGeneration } from '../database/syncGroupBackupRestore.js';

import { edit, relayFixture, storageKey } from './webDavRelayAttachmentFixture.testSupport.js';

type Fixture = Awaited<ReturnType<typeof relayFixture>>;

function status(fixture: Fixture, directory: URL) {
  return fixture.request(directory, { method: 'PROPFIND', headers: { Depth: '0' } }, webDavRelayStatus);
}

async function publishAttachment(fixture: Fixture, index: 0 | 1, id: string) {
  const sender = fixture.peers[index];
  const bytes = Buffer.from(`Image for ${id}`);
  const key = storageKey(bytes);
  const file = path.join(sender.assets, key);
  await writeFile(file, bytes);
  const afterBaseline = new Date((await fixture.scope(sender.peer))!.baseline.capturedAt + 1_000);
  await utimes(file, afterBaseline, afterBaseline);
  await edit(sender.peer, [key], id);
  expect(await fixture.sync(sender)).toMatchObject({ published: 2 });
  const scope = (await fixture.scope(sender.peer))!;
  return { bytes, key, file, scope };
}

it('does not load unrelated history while deduplicating listed packets or checking an empty relay', async () => {
  const fixture = await relayFixture();
  try {
    const phone = fixture.peers[1];
    const first = await publishAttachment(fixture, 0, 'with-history');
    expect(await fixture.sync(phone)).toMatchObject({ applied: 2 });
    const { key } = (await fixture.scope(phone.peer))!;
    const history = new Set(Array.from({ length: 200 }, () =>
      `${key}:applied:20250101T000000.000Z-${crypto.randomUUID()}.dat`));
    await phone.peer.db.run(`INSERT INTO sync_group_metadata (key, value, updated_at)
      SELECT value, 'true', '2025-01-01' FROM json_each(?)`, [JSON.stringify([...history])]);
    const observed: string[] = [];
    const observeRows = (rows: DbRow[]) => {
      for (const row of rows) if (typeof row.key === 'string' && history.has(row.key)) observed.push(row.key);
    };
    expect(await fixture.sync(phone, undefined, { observeRows })).toMatchObject({ applied: 0 });
    expect(observed).toHaveLength(0);

    expect(await fixture.lan(true, undefined, 1)).toMatchObject({ complete: true });
    expect(await status(fixture, first.scope.outgoing)).toBe(404);
    await phone.reopen();
    expect(await fixture.sync(phone, undefined, { observeRows })).toMatchObject({ applied: 0 });
    expect(observed).toHaveLength(0);
  } finally { await fixture.close(); }
});

it('keeps receipts until incoming deletion succeeds, then prunes only the retired collection', async () => {
  const fixture = await relayFixture();
  try {
    const phone = fixture.peers[1];
    const first = await publishAttachment(fixture, 0, 'retire-receipts');
    expect(await fixture.sync(phone)).toMatchObject({ applied: 2 });
    const { key } = (await fixture.scope(phone.peer))!;
    const readReceipts = () => phone.peer.db.query<{ key: string }>(
      'SELECT key FROM sync_group_metadata WHERE key >= ? AND key < ? ORDER BY key', [`${key}:applied:`, `${key}:applied;`]);
    const firstReceipts = await readReceipts();
    expect(firstReceipts).toHaveLength(2);
    fixture.rejectNextDelete(first.scope.outgoing);
    expect(await fixture.lan(true, undefined, 1)).toMatchObject({ complete: true });
    expect(await status(fixture, first.scope.outgoing)).toBe(207);
    expect(await readReceipts()).toEqual(firstReceipts);

    const next = await publishAttachment(fixture, 0, 'keep-current-receipts');
    expect(await fixture.sync(phone)).toMatchObject({ applied: 2 });
    const activeReceipts = (await readReceipts()).filter(row => !firstReceipts.some(old => old.key === row.key));
    expect(activeReceipts).toHaveLength(2);
    expect(await fixture.lan(true, undefined, 1)).toMatchObject({ complete: true });
    expect(await status(fixture, first.scope.outgoing)).toBe(404);
    expect(await status(fixture, next.scope.outgoing)).toBe(207);
    await phone.reopen();
    expect(await readReceipts()).toEqual(activeReceipts);
    expect(await fixture.sync(phone)).toMatchObject({ applied: 0 });
    expect(await readFile(path.join(phone.assets, next.key))).toEqual(next.bytes);
  } finally { await fixture.close(); }
});

it.each([true, false])('keeps both directions until LAN verifies the attachment and delivers from fresh collections (trailing slash: %s)', async trailingSlash => {
  const fixture = await relayFixture();
  try {
    fixture.dav.listing.omitCollectionTrailingSlashes = !trailingSlash;
    const [mac, phone] = fixture.peers;
    const reverse = await publishAttachment(fixture, 1, 'phone-original');
    const first = await publishAttachment(fixture, 0, 'mac-original');
    expect(await hasWebDavRelayPublishedChanges(mac.peer.db, first.scope)).toBe(true);
    await rename(first.file, first.file + '.offline');

    expect(await fixture.lan(true, undefined, 1)).toMatchObject({ complete: true, attachments: { pending: 1 } });
    expect(fixture.dav.deletions).toEqual([]);
    expect(await status(fixture, first.scope.outgoing)).toBe(207);
    expect(await status(fixture, reverse.scope.outgoing)).toBe(207);

    await rename(first.file + '.offline', first.file);
    expect(await fixture.lan(true, undefined, 1)).toMatchObject({ complete: true, attachments: { pending: 0 } });
    expect(fixture.dav.deletions.sort()).toEqual([first.scope.outgoing.pathname, reverse.scope.outgoing.pathname].sort());
    expect(await status(fixture, first.scope.outgoing)).toBe(404);
    expect(await status(fixture, reverse.scope.outgoing)).toBe(404);
    await mac.reopen();
    await phone.reopen();
    expect(await hasWebDavRelayPublishedChanges(mac.peer.db, (await fixture.scope(mac.peer))!)).toBe(false);
    expect(await readFile(path.join(phone.assets, first.key))).toEqual(first.bytes);
    expect(await readFile(path.join(mac.assets, reverse.key))).toEqual(reverse.bytes);

    const next = await publishAttachment(fixture, 0, 'mac-after-cleanup');
    expect(next.scope.outgoing.href).not.toBe(first.scope.outgoing.href);
    await fixture.sync(phone);
    expect(await readFile(path.join(phone.assets, next.key))).toEqual(next.bytes);
    expect(await status(fixture, next.scope.outgoing)).toBe(207);
  } finally { await fixture.close(); }
});

it.each(['body', 'attachment'] as const)('retains a collection with an unconfirmed %s publication until another complete LAN round', async packet => {
  const fixture = await relayFixture();
  try {
    const [mac, phone] = fixture.peers;
    const first = await publishAttachment(fixture, 0, 'old');
    const reverse = await publishAttachment(fixture, 1, 'reverse');
    const bytes = Buffer.from('unconfirmed publication');
    const key = storageKey(bytes);
    await writeFile(path.join(mac.assets, key), bytes);
    await edit(mac.peer, [key], 'unconfirmed');
    if (packet === 'body') fixture.dav.dropNextMove();
    else fixture.loseAttachmentPublicationResponse();
    await expect(fixture.sync(mac)).rejects.toThrow();

    expect(await fixture.lan()).toMatchObject({ complete: true, attachments: { pending: 0 } });
    expect(fixture.dav.deletions).toEqual([reverse.scope.outgoing.pathname]);
    expect(await status(fixture, first.scope.outgoing)).toBe(207);
    expect(await readFile(path.join(phone.assets, key))).toEqual(bytes);
    await mac.reopen();
    await fixture.sync(mac);
    expect(fixture.dav.deletions).toEqual([reverse.scope.outgoing.pathname]);
    expect(await fixture.lan()).toMatchObject({ complete: true, attachments: { pending: 0 } });
    expect(await status(fixture, first.scope.outgoing)).toBe(404);
  } finally { await fixture.close(); }
});

it('retains a collection if an attachment disappeared after the LAN demand queue was drained', async () => {
  const fixture = await relayFixture();
  try {
    const published = await publishAttachment(fixture, 0, 'physical-loss');
    const received = path.join(fixture.peers[1].assets, published.key);
    expect(await fixture.lan(false)).toMatchObject({ complete: true, attachments: { pending: 0 } });
    expect(await readFile(received)).toEqual(published.bytes);
    expect(await fixture.lan(false)).toMatchObject({ complete: true, attachments: { transferred: 0, pending: 0 } });
    await rename(received, received + '.offline');

    expect(await fixture.lan()).toMatchObject({ complete: true, attachments: { pending: 0 } });
    expect(fixture.dav.deletions).toEqual([]);
    expect(await status(fixture, published.scope.outgoing)).toBe(207);
    await rename(received + '.offline', received);
    expect(await fixture.lan()).toMatchObject({ complete: true, attachments: { pending: 0 } });
    expect(await status(fixture, published.scope.outgoing)).toBe(404);
  } finally { await fixture.close(); }
});

it.each(['restore', 'adoption'] as const)('invalidates captured cleanup after a local %s changes the generation', async kind => {
  const fixture = await relayFixture();
  try {
    const [mac, phone] = fixture.peers;
    const first = await publishAttachment(fixture, 0, 'before-generation-change');
    await fixture.lan(true, async () => {
      const libraryEpoch = `${kind}-${crypto.randomUUID()}`;
      if (kind === 'restore') resetSyncGeneration(createBetterSqlite3Driver(mac.peer.sqlite), libraryEpoch);
      else await mac.peer.db.transaction(db => beginSyncGroupLocalAdoption(db, { groupId: 'group', libraryEpoch,
        endpointUrl: 'http://127.0.0.1/', providerDeviceId: phone.peer.id, providerDeviceName: 'Phone', providerPlatform: 'android' }));
    });
    expect(await fixture.scope(mac.peer)).toBeNull();
    expect(fixture.dav.deletions).toEqual([]);
    expect(await status(fixture, first.scope.outgoing)).toBe(207);
  } finally { await fixture.close(); }
});

it('retains a collection when it gains a new packet after the LAN inventory', async () => {
  const fixture = await relayFixture();
  try {
    const first = await publishAttachment(fixture, 0, 'before-lan');
    await fixture.lan(true, async () => {
      await publishAttachment(fixture, 0, 'after-lan-inventory');
    });
    expect(fixture.dav.deletions).toEqual([]);
    expect(await status(fixture, first.scope.outgoing)).toBe(207);
    await fixture.lan();
    expect(await status(fixture, first.scope.outgoing)).toBe(404);
  } finally { await fixture.close(); }
});

it('retries a failed deletion after reopening and preserves data in the new collection', async () => {
  const fixture = await relayFixture();
  try {
    const [mac, phone] = fixture.peers;
    const first = await publishAttachment(fixture, 0, 'before-delete-error');
    fixture.rejectNextDelete();
    expect(await fixture.lan()).toMatchObject({ complete: true, attachments: { pending: 0 } });
    expect(await status(fixture, first.scope.outgoing)).toBe(207);

    await mac.reopen();
    const next = await publishAttachment(fixture, 0, 'after-delete-error');
    expect(next.scope.outgoing.href).not.toBe(first.scope.outgoing.href);
    await fixture.lan();
    expect(await status(fixture, first.scope.outgoing)).toBe(404);
    expect(await status(fixture, next.scope.outgoing)).toBe(207);
    expect(await readFile(path.join(phone.assets, next.key))).toEqual(next.bytes);
  } finally { await fixture.close(); }
});
