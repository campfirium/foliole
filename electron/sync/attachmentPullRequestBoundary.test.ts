// @vitest-environment node
import { createHash } from 'node:crypto';
import http from 'node:http';

import { expect, it, vi } from 'vitest';

import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { attachmentMessage } from '../../lib/core/sync/requestSyncAttachmentContract.js';
import { respondRequestSyncAttachments, type RequestSyncAttachmentHost } from '../../lib/core/sync/requestSyncAttachmentResponse.js';
import { prepareRequestSyncWire } from '../../lib/core/sync/requestSyncWire.js';

import { FRAMED_SYNC_BODY_SHA256_HEADER, FRAMED_SYNC_CONTENT_TYPE,
  framedSyncPathWithIdentity, handleCompanionLanFramedSyncPost } from './companionLanFramedSyncPost.js';
import { encodeFramedSyncStream, type FramedSyncStreamBody } from './desktopFramedSyncStream.js';
import { prepareDesktopRequestSyncBody } from './desktopRequestSyncBody.js';

const context = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
  initiatorDeviceId: 'a', initiatorLibraryEpoch: 'a-epoch', responderDeviceId: 'b', responderLibraryEpoch: 'b-epoch' } as const;
const groupKey = new Uint8Array(32).fill(7);
const storageKey = `${'a'.repeat(64)}.pdf`;

async function bytes(body: FramedSyncStreamBody) {
  const chunks: Buffer[] = [];
  for await (const chunk of encodeFramedSyncStream(body)) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function request(count = 1) {
  return bytes(await prepareRequestSyncWire({ context, groupKey, messages: async function* () {
    for (let index = 0; index < count; index++) {
      yield attachmentMessage({ operation: 'pull', storageKey, requestId: new Uint8Array(16) });
    }
  } }));
}

it.each(['extra-message', 'extra-session', 'garbage-tail', 'wrong-signature', 'wrong-key'])(
  'rejects %s before sending an attachment response or reading payload bytes', async fault => {
    const source = vi.fn();
    const host: RequestSyncAttachmentHost = { async withFile(_key, consume) {
      source();
      return consume({ resource: { storageKey, byteLength: 0 },
        read: async () => { throw new Error('unexpected_read'); } });
    }, needs: async () => [],
      needsSlice: async () => ({ keys: [], pending: false }), status: async () => ({ kind: 'partial', offset: 0 }),
      receive: async () => { throw new Error('unexpected_receive'); } };
    let sent = false;
    const server = http.createServer((incoming, response) => {
      void handleCompanionLanFramedSyncPost({ request: incoming, response,
        localIdentity: { deviceId: 'b', libraryEpoch: 'b-epoch' },
        authenticate: () => ({ ok: true, device_id: 'a', device_name: 'A' }),
        onStream: input => respondRequestSyncAttachments<FramedSyncStreamBody | void>(host, {
          ...input, groupKey: fault === 'wrong-key' ? new Uint8Array(32).fill(8) : groupKey,
          consumePull: async (reply, signal) => { sent = true; await input.consumePull(reply, signal); }
        }, prepareDesktopRequestSyncBody)
      }).catch(error => response.destroy(error));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('test_address_missing');
      let body = await request(fault === 'extra-message' ? 2 : 1);
      if (fault === 'extra-session') body = Buffer.concat([body, await request()]);
      if (fault === 'garbage-tail') body = Buffer.concat([body, Buffer.from('tail')]);
      const response = await fetch(`http://127.0.0.1:${address.port}${framedSyncPathWithIdentity(context)}&request=attachments`, {
        method: 'POST', body, headers: { 'content-type': FRAMED_SYNC_CONTENT_TYPE, 'x-sync-group-id': 'group',
          [FRAMED_SYNC_BODY_SHA256_HEADER]: fault === 'wrong-signature' ? '0'.repeat(64)
            : createHash('sha256').update(body).digest('hex') }
      });
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
      if (fault === 'wrong-signature') expect(response.status).toBe(401);
      expect(await response.json()).toHaveProperty('error');
      expect(source).not.toHaveBeenCalled();
      expect(sent).toBe(false);
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
