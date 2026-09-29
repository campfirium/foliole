import { createHash, createHmac, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { resolveSyncPackPath } from '../database/syncPackBuilderTestSupport.js';

import { createLanWorkspaceSyncRequestHandler } from './companionLanRequestHandler.js';
import { decryptDesktopWorkgroupResponse, encryptDesktopWorkgroupRequest
} from './workgroupHttpCrypto.js';

const GROUP_ID = 'group';
const KEY = Buffer.alloc(32, 7).toString('base64url');

export async function startAuthenticatedSyncHttp({ archiveDir, sourceDeviceId = 'source',
  receiverDeviceId = 'receiver' }: { archiveDir?: string; sourceDeviceId?: string; receiverDeviceId?: string } = {}) {
  const handler = createLanWorkspaceSyncRequestHandler({ appVersion: 'test',
    onJoinRequestCreated: null, deviceId: sourceDeviceId, updateGroupStatus: () => {},
    getSyncStatus: () => null });
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  let archiveIndex = 0;
  async function request(method: 'GET' | 'POST', pathWithQuery: string, body?: string) {
    const timestamp = new Date().toISOString();
    const nonce = randomUUID();
    const encrypted = body === undefined ? '' : encryptDesktopWorkgroupRequest({
      body: Buffer.from(body), contentType: 'application/json', groupId: GROUP_ID,
      method, pathWithQuery });
    const bodyHash = createHash('sha256').update(encrypted).digest('hex');
    const signature = createHmac('sha256', KEY).update(
      [method, pathWithQuery, timestamp, nonce, bodyHash].join('\n')).digest('hex');
    const response = await fetch(origin + pathWithQuery, { method,
      headers: { 'x-device-id': receiverDeviceId, 'x-sync-group-id': GROUP_ID,
        'x-timestamp': timestamp, 'x-nonce': nonce, 'x-signature': signature,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: encrypted }) });
    const originalType = response.headers.get('x-foliole-original-content-type');
    const encoded = Buffer.from(await response.arrayBuffer());
    if (!originalType) throw new Error(`sync_http_unencrypted_response:${response.status}`);
    const plaintext = decryptDesktopWorkgroupResponse({ body: encoded, contentType: originalType,
      groupId: GROUP_ID, method, pathWithQuery });
    if (!response.ok) throw new Error(`sync_http_${response.status}:${plaintext.toString('utf8')}`);
    return plaintext;
  }
  return { origin,
    getJson: async (pathWithQuery: string) => JSON.parse((await request('GET', pathWithQuery))
      .toString('utf8')) as Record<string, unknown>,
    postJson: async (pathWithQuery: string, body: unknown) => JSON.parse((await request(
      'POST', pathWithQuery, JSON.stringify(body))).toString('utf8')) as Record<string, unknown>,
    archive: async (url: URL) => {
      const filePath = archiveDir
        ? `${archiveDir}/http-archive-${++archiveIndex}.syncpack`
        : resolveSyncPackPath(`http-archive-${++archiveIndex}.syncpack`);
      await fs.writeFile(filePath, await request('GET', url.pathname + url.search));
      return { status: 'ready' as const, filePath, cleanup: () => fs.rm(filePath) };
    },
    close: () => new Promise<void>((resolve, reject) => server.close((error) =>
      error ? reject(error) : resolve())) };
}
