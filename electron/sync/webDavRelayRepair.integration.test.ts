// @vitest-environment node
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { encodeFramedSyncStream } from '../../lib/core/sync/framedSyncBinaryStream.js';
import { hasWebDavRelayAttachmentsToSend } from '../../lib/core/sync/webDavRelayAttachments.js';
import { hasWebDavRelayBodyToSend } from '../../lib/core/sync/webDavRelayBodyOutbox.js';
import { webDavRelayStatus } from '../../lib/core/sync/webDavRelayPublication.js';
import { hasWebDavRelayRepairToSend } from '../../lib/core/sync/webDavRelayRepairOutbox.js';
import { prepareWebDavRelayRepair, readWebDavRelayRepair } from '../../lib/core/sync/webDavRelayRepairWire.js';

import { edit, relayFixture, storageKey } from './webDavRelayAttachmentFixture.testSupport.js';
import { webDavTestGroupKey } from './webDavRelayLan.testSupport.js';

it.each([0, 1] as const)('repairs two missing attachments from peer %s without a body edit', async sender => {
  const fixture = await relayFixture();
  try {
    const source = fixture.peers[sender];
    const target = fixture.peers[1 - sender]!;
    const files = ['first missing attachment', 'second missing attachment', 'healthy attachment'].map(value => {
      const bytes = Buffer.from(value);
      return { bytes, key: storageKey(bytes) };
    });
    for (const { key, bytes } of files) {
      await writeFile(path.join(source.assets, key), bytes);
      await edit(source.peer, [key], key);
      await fixture.sync(source);
    }
    await edit(source.peer, [files[0]!.key], 'duplicate-reference');
    await fixture.sync(source);
    for (const uploaded of fixture.uploads.slice(0, 2)) {
      const final = new URL(uploaded.replace(/\.partial$/u, ''));
      const bytes = Buffer.from('broken packet');
      await fixture.request(final, { method: 'PUT', body: { bytes: bytes.length, async *chunks() { yield bytes; } } }, webDavRelayStatus);
    }
    expect(await fixture.sync(target)).toMatchObject({ retries: 2 });
    expect(fixture.repairUploads).toHaveLength(1);
    await target.reopen();
    await source.reopen();
    const sourceScope = (await fixture.scope(source.peer))!;
    expect(await hasWebDavRelayBodyToSend(source.peer.db, sourceScope)).toBe(false);
    expect(await hasWebDavRelayAttachmentsToSend(source.peer.db, sourceScope)).toBe(false);
    await fixture.sync(source);
    expect(fixture.uploads).toHaveLength(5);
    expect(await fixture.sync(target)).toMatchObject({ retries: 0, published: 0 });
    await target.reopen();
    for (const { key, bytes } of files) {
      expect(target.peer.sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get(key)).toContain(key);
      expect(await readFile(path.join(target.assets, key))).toEqual(bytes);
      expect(await readFile(path.join(source.assets, key))).toEqual(bytes);
    }
    expect(await fixture.sync(target)).toMatchObject({ applied: 0, published: 0 });
    expect(fixture.repairUploads).toHaveLength(1);
  } finally { await fixture.close(); }
});

it('withdraws unsent repair demand when LAN supplies the file first', async () => {
  const fixture = await relayFixture();
  try {
    const [source, target] = fixture.peers;
    const bytes = Buffer.from('missing while receiving');
    const key = storageKey(bytes);
    await edit(source.peer, [key], 'changed');
    await fixture.sync(source);
    // The existing freshness contract keeps foreground receive quiet right after a LAN baseline.
    await target.peer.db.run("DELETE FROM sync_group_metadata WHERE key LIKE 'webdav_relay_last_receive:%'");
    const priorRequests = fixture.repairUploads.length;
    const requestSend = vi.fn();
    await fixture.sync(target, undefined, { requestSend });
    expect(requestSend).toHaveBeenCalledOnce();
    expect(await hasWebDavRelayRepairToSend(target.peer.db, (await fixture.scope(target.peer))!)).toBe(true);
    await expect(stat(path.join(target.assets, key))).rejects.toMatchObject({ code: 'ENOENT' });
    await writeFile(path.join(source.assets, key), bytes);
    expect(await fixture.lan(false)).toMatchObject({ complete: true, attachments: { pending: 0 } });
    expect(await readFile(path.join(target.assets, key))).toEqual(bytes);
    await target.reopen();
    await fixture.sync(target);
    expect(fixture.repairUploads).toHaveLength(priorRequests);
    expect(await hasWebDavRelayRepairToSend(target.peer.db, (await fixture.scope(target.peer))!)).toBe(false);
    expect(await readFile(path.join(target.assets, key))).toEqual(bytes);
  } finally { await fixture.close(); }
});

it('replaces a same-length corrupt attachment after the original MOVE response was lost', async () => {
  const fixture = await relayFixture();
  try {
    const [source, target] = fixture.peers;
    const bytes = Buffer.from('lost response then corrupted on the relay');
    const key = storageKey(bytes);
    await writeFile(path.join(source.assets, key), bytes);
    await edit(source.peer, [key], 'changed');
    fixture.loseAttachmentPublicationResponse();
    await expect(fixture.sync(source)).rejects.toThrow('lost_attachment_publication_response');
    const first = new URL(fixture.uploads[0]!.replace(/\.partial$/u, ''));
    const corrupt = await fixture.request(first, { method: 'GET' }, async (_, body) => {
      const parts: Uint8Array[] = [];
      for await (const part of body) parts.push(part);
      const packet = Buffer.concat(parts);
      packet[packet.length - 1] = packet[packet.length - 1]! ^ 1;
      return packet;
    });
    await fixture.request(first, { method: 'PUT', body: { bytes: corrupt.length, async *chunks() { yield corrupt; } } }, webDavRelayStatus);
    expect(await fixture.sync(target)).toMatchObject({ retries: 1 });
    await source.reopen();
    await fixture.sync(source);
    expect(new Set(fixture.uploads).size).toBe(2);
    expect(fixture.attachmentReads.filter(url => url === first.href)).toHaveLength(3);
    await target.reopen();
    await fixture.sync(target);
    expect(await readFile(path.join(target.assets, key))).toEqual(bytes);
  } finally { await fixture.close(); }
});

it('requests each hash once across consecutive send windows when more than one batch is missing', async () => {
  const fixture = await relayFixture();
  try {
    const [source, target] = fixture.peers;
    const keys = Array.from({ length: 65 }, (_, index) => storageKey(Buffer.from(`missing ${index}`)));
    await edit(source.peer, keys, 'changed');
    await fixture.sync(source);
    const sourceScope = (await fixture.scope(source.peer))!;
    await fixture.sync(target);
    expect(await hasWebDavRelayRepairToSend(target.peer.db, (await fixture.scope(target.peer))!)).toBe(true);
    await target.reopen();
    await fixture.sync(target);
    const requests = fixture.repairUploads.filter(url => url.startsWith(sourceScope.incoming.href));
    expect(requests).toHaveLength(2);
    const demand = await Promise.all(requests.map(upload => fixture.request(new URL(upload.replace(/\.partial$/u, '')),
      { method: 'GET' }, (_, body) => readWebDavRelayRepair({ scope: sourceScope, groupKey: webDavTestGroupKey }, body))));
    expect(demand.map(packet => packet.demand.length)).toEqual([64, 1]);
    expect(demand.flatMap(packet => packet.demand.map(([hash]) => hash)).sort()).toEqual(keys.map(key => key.slice(0, 64)).sort());
    expect(await hasWebDavRelayRepairToSend(target.peer.db, (await fixture.scope(target.peer))!)).toBe(false);
  } finally { await fixture.close(); }
});

it('ignores attachment requests for unrelated files and packets from a different binding or epoch', async () => {
  const fixture = await relayFixture();
  try {
    const [source, target] = fixture.peers;
    const publicBytes = Buffer.from('shared file');
    const privateBytes = Buffer.from('unreferenced file');
    const shared = storageKey(publicBytes);
    const unrelated = storageKey(privateBytes);
    await writeFile(path.join(source.assets, shared), publicBytes);
    await writeFile(path.join(source.assets, unrelated), privateBytes);
    await edit(source.peer, [shared], 'shared-article');
    await fixture.sync(source);
    const scope = (await fixture.scope(target.peer))!;
    await fixture.request(scope.outgoing, { method: 'MKCOL' }, webDavRelayStatus);
    const cases = [
      { scope, hash: unrelated },
      { scope: { ...scope, outgoingDirection: new URL('other-binding/', scope.outgoingDirection) }, hash: shared },
      { scope: { ...scope, send: { ...scope.send, initiatorLibraryEpoch: 'old-library' } }, hash: shared }
    ];
    for (const request of cases) {
      const wire = await prepareWebDavRelayRepair({ scope: request.scope, groupKey: webDavTestGroupKey },
        [[request.hash.slice(0, 64), 'shared-article']], false);
      const parts: Uint8Array[] = [];
      for await (const chunk of encodeFramedSyncStream(wire)) parts.push(chunk);
      const packet = Buffer.concat(parts);
      const url = new URL(`20261111T120000.000Z-${crypto.randomUUID()}.repair.dat`, scope.outgoing);
      await fixture.request(url, { method: 'PUT', body: { bytes: packet.length, async *chunks() { yield packet; } } }, webDavRelayStatus);
    }
    expect(await fixture.sync(source)).toMatchObject({ retries: 2, published: 0 });
    expect(fixture.uploads).toHaveLength(1);
  } finally { await fixture.close(); }
});

it('reuses the published repair request after a lost response and a database reopen', async () => {
  const fixture = await relayFixture();
  try {
    const [source, target] = fixture.peers;
    const bytes = Buffer.from('requested before the source file became available');
    const key = storageKey(bytes);
    await edit(source.peer, [key], 'changed');
    await fixture.sync(source);
    fixture.dav.dropNextMove();
    await expect(fixture.sync(target)).rejects.toThrow();
    const scope = (await fixture.scope(target.peer))!;
    const targetRequests = () => fixture.repairUploads.filter(url => url.startsWith(scope.outgoing.href));
    expect(targetRequests()).toHaveLength(1);
    await target.reopen();
    expect(await hasWebDavRelayRepairToSend(target.peer.db, scope)).toBe(true);
    await fixture.sync(target);
    expect(targetRequests()).toHaveLength(1);
    await writeFile(path.join(source.assets, key), bytes);
    await source.reopen();
    await fixture.sync(source);
    await fixture.sync(target);
    expect(await readFile(path.join(target.assets, key))).toEqual(bytes);
    expect(targetRequests()).toHaveLength(1);
  } finally { await fixture.close(); }
});
