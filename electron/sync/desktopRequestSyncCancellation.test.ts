// @vitest-environment node
import http from 'node:http';

import { expect, it } from 'vitest';

import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readRequestSyncInventorySnapshot } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { sendRequestSyncObject } from '../../lib/core/sync/requestSyncObjectEndpoint.js';
import { restoreFixture, originals, type RestorePeer } from '../database/requestSyncRestoreRecovery.testSupport.js';

import { FRAMED_SYNC_CONTENT_TYPE, FRAMED_SYNC_DEVICE_ID_HEADER,
  FRAMED_SYNC_LIBRARY_EPOCH_HEADER } from './companionLanFramedSyncPost.js';
import { pullDesktopRequestSyncObject } from './desktopRequestSyncPullHttp.js';

const context = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
  initiatorDeviceId: 'target', initiatorLibraryEpoch: 'target-epoch',
  responderDeviceId: 'source', responderLibraryEpoch: 'source-epoch' } as const;
const groupKey = new Uint8Array(32).fill(7);

it.each(['headers', 'body'] as const)('cancels a real request stalled at response %s without committing', async stage => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  const controller = new AbortController();
  const ready = deferred();
  const closed = deferred();
  const server = http.createServer();
  try {
    await source.seed('topic');
    const before = originals(target);
    const local = await readRequestSyncInventorySnapshot(source.db);
    const difference = compareFramedSyncInventories({ local, remote: [] }).find(row => row.globalId === 'topic')!;
    const partialBody = await sendRequestSyncObject(source.host, { context, groupKey, difference }, async stream => {
      const chunks = [Buffer.from(stream.preamble)];
      const frames = [];
      for await (const frame of stream.frames) frames.push(frame);
      for (const frame of frames.slice(0, -1)) chunks.push(Buffer.from(frame.headerBytes), Buffer.from(frame.ciphertext));
      return Buffer.concat(chunks);
    });
    server.on('request', (request, response) => {
      request.resume();
      response.on('close', () => closed.resolve());
      if (stage === 'headers') { ready.resolve(); return; }
      response.writeHead(200, { 'Content-Type': FRAMED_SYNC_CONTENT_TYPE,
        [FRAMED_SYNC_DEVICE_ID_HEADER]: 'source', [FRAMED_SYNC_LIBRARY_EPOCH_HEADER]: 'source-epoch' });
      response.write(partialBody, () => ready.resolve());
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test_address_missing');
    const pending = pullDesktopRequestSyncObject(target.host, { context, groupKey, difference: { ...difference, direction: 'remote_to_local' },
      endpointUrl: `http://127.0.0.1:${address.port}`, groupSecret: Buffer.from(groupKey).toString('base64url'),
      signal: controller.signal, peerState: peerState(source) });
    const outcome = pending.then(() => null, (error: unknown) => error);
    await Promise.race([ready.promise, outcome.then(error => { throw error ?? new Error('test_request_completed'); })]);
    controller.abort(new Error('test_stalled_request_cancelled'));
    expect(await outcome).toBeInstanceOf(Error);
    await closed.promise;
    target.reopen();
    expect(originals(target)).toEqual(before);
    expect(target.sqlite.prepare('SELECT * FROM node_version_device_revisions').all()).toEqual([]);
    expect(await target.host.files.list('requests')).toEqual([]);
    expect(await source.host.files.list('requests')).toEqual([]);
  } finally {
    controller.abort(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await fixture.close();
  }
});

function peerState(source: RestorePeer) {
  return { contract_version: 3 as const, group_id: 'group', sender_device_identity_key: source.id,
    library_epoch: source.epoch, proof_revision: 0, source_proof_revisions: {}, devices: [], removals: [], restore: null };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
