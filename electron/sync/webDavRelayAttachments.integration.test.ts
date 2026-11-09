// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

import { recordFramedSyncResourceAvailability } from '../../lib/core/database/framedSyncResourceAvailability.js';
import { ATTACHMENT_BLOCK_BYTES } from '../../lib/core/sync/attachmentBlockReceiver.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { WEB_DAV_ATTACHMENT_SUFFIX } from '../../lib/core/sync/webDavRelayAttachmentWire.js';
import { runWebDavRelayBodyRound } from '../../lib/core/sync/webDavRelayBodyRound.js';
import { readWebDavRelayBodyScope } from '../../lib/core/sync/webDavRelayBodyScope.js';
import { webDavRelayStatus, type WebDavRelayRequest } from '../../lib/core/sync/webDavRelayPublication.js';
import { restoreFixture, type RestorePeer } from '../database/requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from '../database/topicTextState.testSupport.js';

import { openDesktopAttachmentBlockReceiver } from './desktopAttachmentBlockFiles.js';
import { createDesktopAttachmentBlockSource } from './desktopAttachmentBlockSource.js';
import { createDesktopWebDavRelayHttp } from './desktopWebDavRelayHttp.js';
import { runWebDavTestLanRound, webDavTestGroupKey } from './webDavRelayLan.testSupport.js';
import { setupDav } from './webDavRelayTransport.testSupport.js';

it.each(['desktop', 'phone'])('relays a new attachment from %s with an interrupted download and a verified restart', async sender => {
  const fixture = await relayFixture();
  try {
    const [mac, phone] = fixture.peers;
    const [source, target] = sender === 'desktop' ? [mac, phone] : [phone, mac];
    const original = await readFile(path.join(target.assets, fixture.old));
    const bytes = Buffer.alloc(ATTACHMENT_BLOCK_BYTES * 2 + 13, 0x71);
    const key = storageKey(bytes);
    await edit(source.peer, [fixture.old, key], 'changed');
    await fixture.sync(source);
    await fixture.sync(target);
    expect(fixture.uploads).toHaveLength(0);
    expect(target.peer.sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get('changed')).toContain(key);
    const asset = path.join(target.assets, key);
    await expect(stat(asset)).rejects.toMatchObject({ code: 'ENOENT' });

    await writeFile(path.join(source.assets, key), bytes);
    source.peer.reopen();
    fixture.loseAttachmentPublicationResponse();
    await expect(fixture.sync(source)).rejects.toThrow('lost_attachment_publication_response');
    expect(fixture.uploads).toHaveLength(1);
    source.peer.reopen();
    await fixture.sync(source);
    expect(fixture.uploads).toHaveLength(1);
    await expect(fixture.sync(target, interruptAttachment)).rejects.toThrow('interrupted_attachment');
    await expect(stat(asset)).rejects.toMatchObject({ code: 'ENOENT' });
    await target.reopen();
    await expect(fixture.sync(target, corruptAttachment)).rejects.toThrow();
    await expect(stat(asset)).rejects.toMatchObject({ code: 'ENOENT' });
    await fixture.sync(target);
    expect(fixture.uploads).toHaveLength(1);
    await target.reopen();
    expect(await readFile(asset)).toEqual(bytes);
    expect(await readFile(path.join(target.assets, fixture.old))).toEqual(original);
    expect(await fixture.sync(target)).toMatchObject({ applied: 0, published: 0 });
  } finally { await fixture.close(); }
});

async function attachmentPeer(peer: RestorePeer) {
  const libraryRoot = path.join(peer.root, peer.id);
  const assets = path.join(libraryRoot, 'Assets');
  await mkdir(assets, { recursive: true });
  async function open() {
    const owner = await openDesktopAttachmentBlockReceiver({ libraryRoot, assetsDir: assets,
      availability: (hash, available) => peer.host.write(db => recordFramedSyncResourceAvailability(db, [hash], available)) });
    if (owner.kind !== 'acquired') throw new Error('attachment_test_owner_busy');
    return owner;
  }
  let receiver = await open();
  const source = createDesktopAttachmentBlockSource(assets, peer.file);
  return { peer, assets, close: () => receiver.close(), async reopen() {
    await receiver.close();
    peer.reopen();
    receiver = await open();
  }, get attachments() { return { ...source, ...receiver }; } };
}

async function relayFixture() {
  const fixture = await restoreFixture();
  const dav = setupDav(process.env.FOLIOLE_TEST_WEBDAV_URL);
  await new Promise<void>(resolve => dav.server.listen(0, '127.0.0.1', resolve));
  const peers = [await attachmentPeer(fixture.peer('source')), await attachmentPeer(await fixture.companionPeer('target'))] as const;
  const close = async () => {
    await Promise.all(peers.map(peer => peer.close()));
    await new Promise<void>(resolve => dav.server.close(() => resolve()));
    await fixture.close();
  };
  try {
    const address = dav.server.address();
    if (!address || typeof address === 'string') throw new Error('webdav_test_address_missing');
    const url = new URL(`http://127.0.0.1:${address.port}${dav.sandboxPath}${crypto.randomUUID()}/`);
    const uploads: string[] = [];
    let loseAttachmentPublicationResponse = false;
    const http = createDesktopWebDavRelayHttp({ requests: {}, responses: 0, downloadedBytes: 0, uploadedBytes: 0 });
    const request: WebDavRelayRequest = (url, input, consume) => {
      if (input.method === 'PUT' && url.pathname.endsWith(`${WEB_DAV_ATTACHMENT_SUFFIX}.partial`)) uploads.push(url.href);
      return http(url, input, async (status, body) => {
        if (loseAttachmentPublicationResponse && input.method === 'MOVE' && status === 201 &&
            url.pathname.endsWith(`${WEB_DAV_ATTACHMENT_SUFFIX}.partial`)) {
          loseAttachmentPublicationResponse = false;
          await webDavRelayStatus(status, body);
          throw new Error('lost_attachment_publication_response');
        }
        return consume(status, body);
      });
    };
    await request(url, { method: 'MKCOL' }, webDavRelayStatus);
    const [mac, phone] = peers;
    const binding = { id: crypto.randomUUID(), group_id: 'group', desktop_device_id: mac.peer.id,
      phone_device_id: phone.peer.id, directory_url: url.href };
    const previous = Buffer.from('Already synchronized image');
    const old = storageKey(previous);
    for (const { assets } of peers) {
      const file = path.join(assets, old);
      await writeFile(file, previous);
      await utimes(file, 100, 100);
    }
    await edit(mac.peer, [old], 'baseline');
    expect(await runWebDavTestLanRound(mac.peer, phone.peer, binding)).toMatchObject({ complete: true });
    for (const [local, remote] of [[mac.peer, phone.peer], [phone.peer, mac.peer]] as const) {
      await local.db.run('INSERT OR IGNORE INTO node_version_device_revisions VALUES (?, ?, ?, 0, ?, NULL, ?)',
        ['group', remote.id, remote.epoch, 'baseline', new Date().toISOString()]);
    }
    return { peers, old, close, uploads, loseAttachmentPublicationResponse: () => { loseAttachmentPublicationResponse = true; },
      async sync({ peer, attachments }: typeof peers[number], alter?: BodyTransform) {
        const scope = await readWebDavRelayBodyScope(peer.db, binding, peer.id);
        if (!scope) throw new Error('webdav_test_baseline_missing');
        return runWebDavRelayBodyRound({ host: { ...peer.host, enqueueSearchInvalidations: peer.desktop },
          files: peer.host.files, attachments, scope, groupKey: webDavTestGroupKey,
          request: alter ? alterAttachmentDownload(request, alter) : request, lanConnected: () => false,
          assertScope: async () => {}, progress: { published: 0, applied: 0, retries: 0 } });
      }
    };
  } catch (error) { await close(); throw error; }
}

function storageKey(bytes: Buffer) { return `${createHash('sha256').update(bytes).digest('hex')}.png`; }

async function edit(peer: RestorePeer, keys: string[], version: string) {
  const node = textBranch(version, keys.map(key => `![image](asset://${key})`).join('\n\n'));
  await applySyncNodesWithDbPort(peer.db, [{ ...node, object_id: version, snapshot: { ...node.snapshot, id: version } }],
    { enqueueSearchInvalidations: peer.desktop, operation: 'local_mutation' });
}

type BodyTransform = (body: AsyncIterable<Uint8Array>) => AsyncIterable<Uint8Array>;

function alterAttachmentDownload(request: WebDavRelayRequest, alter: BodyTransform): WebDavRelayRequest {
  return (url, input, consume) => request(url, input, (status, body) => consume(status,
    input.method === 'GET' && url.pathname.endsWith(WEB_DAV_ATTACHMENT_SUFFIX) ? alter(body) : body));
}

async function* interruptAttachment(body: AsyncIterable<Uint8Array>) {
  let bytes = 0;
  for await (const chunk of body) {
    yield chunk;
    bytes += chunk.length;
    if (bytes > ATTACHMENT_BLOCK_BYTES + 4096) throw new Error('interrupted_attachment');
  }
}

async function* corruptAttachment(body: AsyncIterable<Uint8Array>) {
  let last: Uint8Array | undefined;
  for await (const chunk of body) {
    if (last) yield last;
    last = chunk;
  }
  if (last) {
    const corrupt = Uint8Array.from(last);
    const index = corrupt.length - 1;
    corrupt[index] = corrupt[index]! ^ 1;
    yield corrupt;
  }
}
