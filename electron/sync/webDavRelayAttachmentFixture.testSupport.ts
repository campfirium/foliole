import { createHash } from 'node:crypto';
import { access, mkdir, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect } from 'vitest';

import { recordFramedSyncResourceAvailability } from '../../lib/core/database/framedSyncResourceAvailability.js';
import { readRequestSyncAttachmentNeedsSlice } from '../../lib/core/sync/requestSyncAttachmentNeeds.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { WEB_DAV_ATTACHMENT_SUFFIX } from '../../lib/core/sync/webDavRelayAttachmentWire.js';
import { runWebDavRelayBodyRound } from '../../lib/core/sync/webDavRelayBodyRound.js';
import { readWebDavRelayBodyScope } from '../../lib/core/sync/webDavRelayBodyScope.js';
import { webDavRelayStatus, type WebDavRelayRequest } from '../../lib/core/sync/webDavRelayPublication.js';
import type { WebDavAttachmentPolicy } from '../../lib/platform/webDavRelayContract.js';
import { restoreFixture, type RestorePeer } from '../database/requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from '../database/topicTextState.testSupport.js';

import { openDesktopAttachmentBlockReceiver } from './desktopAttachmentBlockFiles.js';
import { createDesktopAttachmentBlockSource } from './desktopAttachmentBlockSource.js';
import { createDesktopWebDavRelayHttp } from './desktopWebDavRelayHttp.js';
import { runWebDavTestLanRound, webDavTestGroupKey } from './webDavRelayLan.testSupport.js';
import { setupDav } from './webDavRelayTransport.testSupport.js';

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
  const inspect = (keys: string[]) => Promise.all(keys.map(async key => {
    try { await access(path.join(assets, key)); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
  }));
  const needsSlice = (shouldYield: () => boolean, excluded?: readonly string[]) =>
    readRequestSyncAttachmentNeedsSlice(peer.host, inspect, shouldYield, false, excluded);
  return { peer, assets, close: () => receiver.close(), async reopen() {
    await receiver.close();
    peer.reopen();
    receiver = await open();
  }, get attachments() { return { ...source, ...receiver, needsSlice, needs: async () => (await needsSlice(() => false)).keys }; } };
}

export async function relayFixture(attachmentPolicy?: WebDavAttachmentPolicy) {
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
    const transport = testTransport();
    const { request } = transport;
    await request(url, { method: 'MKCOL' }, webDavRelayStatus);
    const [mac, phone] = peers;
    const binding = { id: crypto.randomUUID(), group_id: 'group', desktop_device_id: mac.peer.id,
      phone_device_id: phone.peer.id, directory_url: url.href, attachment_policy: attachmentPolicy };
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
    const scope = (peer: RestorePeer) => peer.host.readSnapshot(db => readWebDavRelayBodyScope(db, binding, peer.id));
    const lanSide = ({ peer, attachments }: typeof peers[number], cleanup: boolean) => ({
      attachments, ...(cleanup ? { cleanup: { host: peer.host, files: peer.host.files, request, attachments,
        loadScope: (db: RestorePeer['db']) => readWebDavRelayBodyScope(db, binding, peer.id) } } : {})
    });
    return { peers, old, close, scope, dav, ...transport,
      lan(cleanup = true, beforeFinish?: () => Promise<void>, initiator: 0 | 1 = 0) {
        const local = peers[initiator];
        const remote = peers[initiator === 0 ? 1 : 0];
        return runWebDavTestLanRound(local.peer, remote.peer, binding, { local: lanSide(local, cleanup),
          remote: lanSide(remote, cleanup), ...(beforeFinish ? { beforeFinish } : {}) });
      },
      async sync({ peer, attachments }: typeof peers[number], alter?: BodyTransform) {
        const current = await scope(peer);
        if (!current) throw new Error('webdav_test_baseline_missing');
        return runWebDavRelayBodyRound({ host: { ...peer.host, enqueueSearchInvalidations: peer.desktop },
          files: peer.host.files, attachments, scope: current, groupKey: webDavTestGroupKey,
          request: alter ? alterAttachmentDownload(request, alter) : request, lanConnected: () => false,
          assertScope: async () => {
            const active = await scope(peer);
            if (active?.key !== current.key || active.outgoing.href !== current.outgoing.href) throw new Error('webdav_relay_scope_changed');
          }, progress: { published: 0, applied: 0, retries: 0 } });
      }
    };
  } catch (error) { await close(); throw error; }
}

function testTransport() {
  const uploads: string[] = [];
  let loseAttachmentPublicationResponse = false;
  let rejectNextDelete = false;
  const http = createDesktopWebDavRelayHttp({ requests: {}, responses: 0, downloadedBytes: 0, uploadedBytes: 0 });
  const request: WebDavRelayRequest = (url, input, consume) => {
    if (input.method === 'DELETE' && rejectNextDelete) {
      rejectNextDelete = false;
      throw new Error('test_delete_connection_reset');
    }
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
  return { uploads, request, rejectNextDelete: () => { rejectNextDelete = true; },
    loseAttachmentPublicationResponse: () => { loseAttachmentPublicationResponse = true; } };
}

export function storageKey(bytes: Buffer) { return `${createHash('sha256').update(bytes).digest('hex')}.png`; }

export async function edit(peer: RestorePeer, keys: string[], version: string) {
  const node = textBranch(version, keys.map(key => `![image](asset://${key})`).join('\n\n'));
  await applySyncNodesWithDbPort(peer.db, [{ ...node, object_id: version, snapshot: { ...node.snapshot, id: version } }],
    { enqueueSearchInvalidations: peer.desktop, operation: 'local_mutation' });
}

type BodyTransform = (body: AsyncIterable<Uint8Array>) => AsyncIterable<Uint8Array>;

function alterAttachmentDownload(request: WebDavRelayRequest, alter: BodyTransform): WebDavRelayRequest {
  return (url, input, consume) => request(url, input, (status, body) => consume(status,
    input.method === 'GET' && url.pathname.endsWith(WEB_DAV_ATTACHMENT_SUFFIX) ? alter(body) : body));
}
