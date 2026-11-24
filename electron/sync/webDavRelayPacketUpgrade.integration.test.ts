// @vitest-environment node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

import { hasWebDavRelayBodyToSend, webDavRelayPacketDirectory } from '../../lib/core/sync/webDavRelayBodyOutbox.js';
import { hasWebDavRelayRepairToSend } from '../../lib/core/sync/webDavRelayRepairOutbox.js';
import type { RestorePeer } from '../database/requestSyncRestoreRecovery.testSupport.js';

import { edit as editArticle, relayFixture, storageKey } from './webDavRelayAttachmentFixture.testSupport.js';
import { edit, text, withRelayPeers } from './webDavRelayBodyRound.testSupport.js';
import type { setupDav } from './webDavRelayTransport.testSupport.js';

type Intercept = NonNullable<Parameters<typeof setupDav>[1]>;

it('ignores remote BIN packets and continues receiving DAT', async () => {
  const relay = datOnlyRelay(403);
  let seedBin = true;
  await withRelayPeers(async ({ source, target, sync }) => {
    await edit(source, 'old-only', 'Published as BIN');
    expect(await sync(source)).toMatchObject({ published: 1 });
    seedBin = false;
    await edit(source, 'current', 'Published as DAT');
    expect(await sync(source)).toMatchObject({ published: 1 });

    expect(await sync(target)).toMatchObject({ applied: 1 });
    target.reopen();
    expect(await text(target, 'old-only')).toBeUndefined();
    expect(await text(target, 'current')).toBe('Published as DAT');
    expect(relay.binRequests).toEqual([]);
  }, (response, request) => {
    if (seedBin && request.method === 'MOVE' && typeof request.headers.destination === 'string') {
      request.headers.destination = request.headers.destination.replace(/\.dat$/u, '.bin');
      return false;
    }
    return relay.intercept(response, request);
  });
});

it('rebuilds a staged BIN body from the last published sequence after reopening', async () => {
  const relay = datOnlyRelay(403);
  await withRelayPeers(async ({ source, target, sync, scope }) => {
    await edit(source, 'published', 'Already published as DAT');
    expect(await sync(source)).toMatchObject({ published: 1 });
    const current = await scope(source);
    const key = `${current.key}:outbox`;
    const lastPublished = await readMetadata(source, key);
    expect(lastPublished).toMatchObject({ packet: null });

    relay.rejectPut = /\.dat\.partial$/u;
    await edit(source, 'staged', 'Staged before the upgrade');
    await expect(sync(source)).rejects.toThrow('webdav_relay_stage_failed:500');
    const original = await markAsBin(source, key);
    const slot = webDavRelayPacketDirectory(current);
    await replaceStagedChunk(source, slot);
    await edit(source, 'new', 'Edited after the upgrade');

    source.reopen();
    expect(await hasWebDavRelayBodyToSend(source.db, current)).toBe(true);
    // A LAN session can interrupt sending after the obsolete local staging is discarded.
    expect(await sync(source, undefined, true)).toMatchObject({ published: 0 });
    expect(await readMetadata(source, key)).toEqual(lastPublished);
    expect(await source.host.files.list(slot)).toEqual([]);

    relay.rejectPut = undefined;
    const beforeUpgradeSend = relay.uploads.length;
    expect(await sync(source)).toMatchObject({ published: 1, retries: 0 });
    const newUploads = relay.uploads.slice(beforeUpgradeSend);
    expect(newUploads).toEqual([expect.stringMatching(/\.dat\.partial$/u)]);
    expect(newUploads).not.toContain(`${original}.partial`);
    expect(await source.host.files.list(slot)).toEqual([]);
    source.reopen();
    const outbox = await readMetadata(source, key);
    expect(outbox).toMatchObject({ packet: null });
    expect(await hasWebDavRelayBodyToSend(source.db, current)).toBe(false);

    expect(await sync(target)).toMatchObject({ applied: 3 });
    target.reopen();
    expect(await text(target, 'published')).toBe('Already published as DAT');
    expect(await text(target, 'staged')).toBe('Staged before the upgrade');
    expect(await text(target, 'new')).toBe('Edited after the upgrade');
    expect(relay.binRequests).toEqual([]);
  }, relay.intercept);
});

it('rebuilds a staged BIN attachment from its queued source file', async () => {
  const relay = datOnlyRelay(405);
  const fixture = await relayFixture(undefined, { intercept: relay.intercept });
  try {
    const [source, target] = fixture.peers;
    const bytes = Buffer.from('Original attachment bytes');
    const attachment = storageKey(bytes);
    await writeFile(path.join(source.assets, attachment), bytes);
    await editArticle(source.peer, [attachment], 'attachment');
    relay.rejectPut = /\.asset\.dat\.partial$/u;
    await expect(fixture.sync(source)).rejects.toThrow('webdav_relay_stage_failed:500');
    const scope = (await fixture.scope(source.peer))!;
    const key = `${scope.key}:attachment-outbox`;
    const original = await markAsBin(source.peer, key, '$.name');
    const slot = webDavRelayPacketDirectory(scope);
    await replaceStagedChunk(source.peer, slot);

    await source.reopen();
    relay.rejectPut = undefined;
    expect(await fixture.sync(source)).toMatchObject({ published: 1, retries: 0 });
    expect(fixture.uploads).toHaveLength(2);
    expect(new URL(fixture.uploads[1]!).pathname).not.toContain(original);
    expect(await source.peer.host.files.list(slot)).toEqual([]);
    await source.reopen();
    expect(await readMetadata(source.peer, key)).toBeUndefined();
    expect(await readFile(path.join(source.assets, attachment))).toEqual(bytes);

    expect(await fixture.sync(target)).toMatchObject({ applied: 2 });
    await target.reopen();
    expect(await readFile(path.join(target.assets, attachment))).toEqual(bytes);
    expect(relay.binRequests).toEqual([]);
  } finally { await fixture.close(); }
});

it('rebuilds a staged BIN repair request and recovers the missing attachment', async () => {
  const relay = datOnlyRelay(415);
  const fixture = await relayFixture(undefined, { intercept: relay.intercept });
  try {
    const [source, target] = fixture.peers;
    const bytes = Buffer.from('File recovered by a fresh repair request');
    const attachment = storageKey(bytes);
    await editArticle(source.peer, [attachment], 'repair');
    await fixture.sync(source);
    relay.rejectPut = /\.repair\.dat\.partial$/u;
    await expect(fixture.sync(target)).rejects.toThrow('webdav_relay_stage_failed:500');
    const scope = (await fixture.scope(target.peer))!;
    const key = `${scope.key}:repair-outbox`;
    const targetUploads = () => fixture.repairUploads.filter(upload => upload.startsWith(scope.outgoing.href));
    const original = await markAsBin(target.peer, key);
    expect(targetUploads()).toEqual([new URL(`${original}.partial`, scope.outgoing).href]);
    const [directory] = await target.peer.host.files.list('webdav-relay');
    await replaceStagedChunk(target.peer, `webdav-relay/${directory!}`);

    await target.reopen();
    expect(await hasWebDavRelayRepairToSend(target.peer.db, scope)).toBe(true);
    relay.rejectPut = undefined;
    await fixture.sync(target);
    expect(targetUploads()).toHaveLength(2);
    const newUpload = new URL(targetUploads()[1]!).pathname;
    expect(newUpload).toMatch(/\.repair\.dat\.partial$/u);
    expect(newUpload).not.toContain(original);
    expect(await target.peer.host.files.list('webdav-relay')).toEqual([]);

    await writeFile(path.join(source.assets, attachment), bytes);
    await fixture.sync(source);
    await fixture.sync(target);
    await target.reopen();
    expect(await readFile(path.join(target.assets, attachment))).toEqual(bytes);
    expect(await readMetadata(target.peer, key)).toMatchObject({ demand: [] });
    expect(await readMetadata(target.peer, key)).not.toHaveProperty('packet');
    expect(await hasWebDavRelayRepairToSend(target.peer.db, scope)).toBe(false);
    expect(relay.binRequests).toEqual([]);
  } finally { await fixture.close(); }
});

function datOnlyRelay(rejectionStatus: number) {
  const binRequests: string[] = [];
  const uploads: string[] = [];
  const relay = { rejectPut: undefined as RegExp | undefined };
  const intercept: Intercept = (response, request) => {
    const url = request.url!;
    if (/\.bin(?:\.partial)?$/u.test(url)) {
      binRequests.push(`${request.method} ${url}`);
      response.writeHead(rejectionStatus).end();
      return true;
    }
    if (request.method === 'PUT') {
      uploads.push(path.posix.basename(url));
      if (relay.rejectPut?.test(url)) {
        response.writeHead(500).end();
        return true;
      }
    }
    return false;
  };
  return Object.assign(relay, { intercept, binRequests, uploads });
}

async function markAsBin(peer: RestorePeer, key: string, namePath = '$.packet.name') {
  const [row] = await peer.db.query<{ name: string }>(
    'SELECT json_extract(value, ?) AS name FROM sync_group_metadata WHERE key = ?', [namePath, key]);
  expect(row?.name).toMatch(/\.dat$/u);
  await peer.db.run('UPDATE sync_group_metadata SET value = json_set(value, ?, ?) WHERE key = ?',
    [namePath, row!.name.replace(/\.dat$/u, '.bin'), key]);
  return row!.name;
}

async function replaceStagedChunk(peer: RestorePeer, slot: string) {
  const file = `${slot}/0`;
  expect(await peer.host.files.read(file)).not.toBeNull();
  await peer.host.files.write(file, Buffer.from('Obsolete staged bytes'));
}

async function readMetadata(peer: RestorePeer, key: string) {
  const [row] = await peer.db.query<{ value: string }>('SELECT value FROM sync_group_metadata WHERE key = ?', [key]);
  return row && JSON.parse(row.value) as unknown;
}
