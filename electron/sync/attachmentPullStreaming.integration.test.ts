// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { expect, it, vi } from 'vitest';

const sandbox = vi.hoisted(() => ({ root: '' }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] }, app: {
  getPath: (name: string) => `${sandbox.root}/host/${name}`, isPackaged: false
} }));

import { ATTACHMENT_BLOCK_BYTES as BLOCK } from '../../lib/core/sync/attachmentBlockReceiver.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { pullRequestSyncAttachmentWindows } from '../../lib/core/sync/requestSyncAttachmentPull.js';
import { withRequestSyncPeerRound } from '../../lib/core/sync/requestSyncPeerRound.js';
import { createSyncPeerRoundOwnership } from '../../lib/core/sync/syncPeerRoundOwnership.js';
import { closeDatabaseConnection, runWithDatabaseConnectionMaintenance } from '../database/connection.js';
import { resolveRuntimeDataPaths } from '../database/runtimeDataPaths.js';

import { handleProductionCompanionFramedSyncPost } from './companionLanFramedSyncRoute.js';
import { clearCompanionRequestNonceCache } from './companionRequestAuth.js';
import * as sources from './desktopAttachmentBlockSource.js';
import { attachmentGroupKey, attachmentHttpDirectory,
  attachmentHttpSource, seedAttachmentTarget } from './desktopRequestSyncAttachments.testSupport.js';
import { createDesktopRequestSyncExchange } from './desktopRequestSyncExchange.js';
import { clearDesktopSyncGroupMemberStateReadiness } from './desktopSyncGroupMemberStateReadiness.js';

it.each(['complete', 'cancel', 'source-change'])('streams the first block before the rest with %s over signed production HTTP', async mode => {
  const directory = await attachmentHttpDirectory(); sandbox.root = directory.root;
  vi.stubEnv('FOLIOLE_LIBRARY_HOME', path.join(directory.root, 'target'));
  const bytes = Buffer.alloc(BLOCK * 3 + 19, 0x37);
  const storageKey = `${createHash('sha256').update(bytes).digest('hex')}.pdf`;
  const local = await attachmentHttpSource([storageKey], directory.root);
  await seedAttachmentTarget([storageKey]);
  await writeFile(path.join(resolveRuntimeDataPaths().assetsDir, storageKey), bytes);
  const receivedFirst = deferred();
  const releaseSource = deferred();
  let active = false;
  let sourceReads = 0;
  const spy = observeSource(releaseSource.promise, value => { active = value; }, () => { sourceReads++; });
  const server = await directServer();
  const controller = new AbortController();
  const owner = createSyncPeerRoundOwnership(60_000);
  const id = crypto.randomUUID(), lease = owner.acquireOutbound('local', id)!;
  const peerRound = { id, lease, admitted: false };
  const exchange = createDesktopRequestSyncExchange({ signal: controller.signal, peerRound, endpointUrl: server.url, groupKey: attachmentGroupKey,
    groupSecret: Buffer.from(attachmentGroupKey).toString('base64url'),
    context: { protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION, groupId: 'group', initiatorDeviceId: 'peer',
      initiatorLibraryEpoch: 'peer-epoch', responderDeviceId: 'local', responderLibraryEpoch: 'local-epoch' } });
  const host = { ...local.host, async receive(...args: Parameters<typeof local.host.receive>) {
    const result = await local.host.receive(...args);
    if (args[1] === 0) receivedFirst.resolve();
    return result;
  } };
  const started = performance.now();
  const transfer = withRequestSyncPeerRound(exchange, peerRound,
    () => pullRequestSyncAttachmentWindows(host, exchange, storageKey, () => false));
  void transfer.catch(() => {});
  try {
    const first = await Promise.race([receivedFirst.promise.then(() => true), delay(2000).then(() => false)]);
    expect(first).toBe(true);
    expect(active).toBe(true);
    expect(sourceReads).toBeLessThanOrEqual(2);
    if (mode !== 'complete') {
      await verifyInterrupted(mode, controller, storageKey, bytes, local, transfer, releaseSource.resolve, () => active);
    } else {
      // A wait longer than the old payload deadline must not shorten the response.
      await delay(300);
      releaseSource.resolve();
      expect(await transfer).toMatchObject({ complete: true, blocks: 4 });
      expect(active).toBe(false);
      expect(await readFile(path.join(local.assetsDir, storageKey))).toEqual(bytes);
      expect(local.sqlite.prepare('SELECT available FROM framed_sync_resource_availability').pluck().all()).toEqual([1]);
      expect(sourceReads).toBe(4);
      expect(server.attachmentRequests()).toBe(2);
      console.info(JSON.stringify({ fixtureBytes: bytes.length, blocks: sourceReads,
        elapsedMs: Math.round(performance.now() - started), hash: storageKey, injectedWaitMs: 300 }));
    }
  } finally {
    releaseSource.resolve(); await transfer.catch(() => {});
    lease.release(); owner.close(); spy.mockRestore(); await server.close(); await local.close();
    await runWithDatabaseConnectionMaintenance(() => closeDatabaseConnection());
    clearDesktopSyncGroupMemberStateReadiness(); clearCompanionRequestNonceCache();
    vi.unstubAllEnvs(); await directory.remove(); sandbox.root = '';
  }
});

function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function observeSource(releaseSource: Promise<void>, setActive: (active: boolean) => void, onRead: () => void) {
  const original = sources.createDesktopAttachmentBlockSource;
  return vi.spyOn(sources, 'createDesktopAttachmentBlockSource').mockImplementation((...args) => {
    const source = original(...args);
    return { withFile(key, consume, options) {
      return source.withFile(key, async file => {
        setActive(true);
        try { return await consume({ ...file, async read(offset, length) {
          onRead();
          if (offset > 0) await releaseSource;
          return file.read(offset, length);
        } }); } finally { setActive(false); }
      }, options);
    } };
  });
}

async function verifyInterrupted(mode: string, controller: AbortController, storageKey: string, bytes: Buffer,
  local: Awaited<ReturnType<typeof attachmentHttpSource>>, transfer: Promise<unknown>, release: () => void, active: () => boolean) {
  if (mode === 'cancel') {
    controller.abort(new Error('test_cancel'));
    await expect(transfer).rejects.toThrow();
    expect(active()).toBe(true);
  } else {
    const corrupted = Buffer.from(bytes);
    corrupted[BLOCK] = 0xff;
    await writeFile(path.join(resolveRuntimeDataPaths().assetsDir, storageKey), corrupted);
  }
  release();
  await expect(transfer).rejects.toThrow();
  await vi.waitFor(() => expect(active()).toBe(false));
  await expect(readFile(path.join(local.assetsDir, storageKey))).rejects.toMatchObject({ code: 'ENOENT' });
  expect(local.sqlite.prepare('SELECT available FROM framed_sync_resource_availability WHERE available = 1').all()).toEqual([]);
}

async function directServer() {
  let requests = 0;
  const server = http.createServer((request, response) => {
    if (request.url?.includes('request=attachments')) requests++;
    void handleProductionCompanionFramedSyncPost({ deviceId: 'local', request, response }).catch(error => response.destroy(error));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test_address_invalid');
  return { url: `http://127.0.0.1:${address.port}`, attachmentRequests: () => requests,
    close: () => new Promise<void>(resolve => server.close(() => resolve())) };
}
