// @vitest-environment node
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { brotliCompressSync, gzipSync } from 'node:zlib';

import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../database/connection.js', () => ({
  runWithDatabaseConnectionOwner: async (execute: () => unknown) => await execute()
}));

import { readDesktopWorkgroupResponse, requestJson } from './desktopSyncGroupHttp.js';
import { lanPeerHttp } from './lanPeerHttp.js';
import { isWorkgroupConnectionReset } from './workgroupConnectionReset.js';

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  })));
});

async function startPeer(handler: http.RequestListener) {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function encodedJsonPeer(encoding: string, encode: (body: Buffer) => Buffer) {
  return startPeer((_request, response) => {
    response.writeHead(200, { 'content-encoding': encoding, 'content-type': 'application/json' });
    response.end(encode(Buffer.from(JSON.stringify({ accepted: true }))));
  });
}

it('decodes a Brotli-encoded peer response on the join request path with the patched runtime', async () => {
  const origin = await encodedJsonPeer('br', brotliCompressSync);
  await expect(requestJson(`${origin}/sync-group/join-requests`, { body: '{}', method: 'POST' }))
    .resolves.toEqual({ accepted: true });
});

it('decodes gzip-encoded peer responses with standard fetch', async () => {
  const origin = await encodedJsonPeer('gzip', gzipSync);
  const response = await lanPeerHttp.fetch(`${origin}/companion/discovery`);
  await expect(response.json()).resolves.toEqual({ accepted: true });
});

it('delivers identity peer responses with the request body, headers and status intact', async () => {
  const origin = await startPeer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      response.writeHead(201, { 'content-encoding': 'identity', 'content-type': 'application/json' });
      response.end(JSON.stringify({ body: Buffer.concat(chunks).toString(), method: request.method,
        signed: request.headers['x-foliole-signature'] }));
    });
  });
  const response = await lanPeerHttp.fetch(`${origin}/sync-group/member-state`, {
    body: Buffer.from('payload'), headers: { 'X-Foliole-Signature': 'sig' }, method: 'POST'
  });
  expect(response.status).toBe(201);
  expect(response.headers.get('content-type')).toBe('application/json');
  await expect(response.json()).resolves.toEqual({ body: 'payload', method: 'POST', signed: 'sig' });
});

it('reports a reset before the response as the retryable fetch failure', async () => {
  const origin = await startPeer((request) => { request.socket.resetAndDestroy(); });
  const error = await lanPeerHttp.fetch(`${origin}/companion/sync-identity-summary`).catch((caught) => caught);
  expect(isWorkgroupConnectionReset(error)).toBe(true);
});

it('stops waiting for headers when the request signal times out', async () => {
  const origin = await startPeer(() => undefined);
  await expect(lanPeerHttp.fetch(`${origin}/companion/discovery`, { signal: AbortSignal.timeout(50) }))
    .rejects.toMatchObject({ name: 'TimeoutError' });
});

it('stops a stalled response body when the request signal times out', async () => {
  const origin = await startPeer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.write('{"partial":');
  });
  const response = await lanPeerHttp.fetch(`${origin}/companion/resource-availability`, {
    signal: AbortSignal.timeout(100)
  });
  await expect(response.text()).rejects.toBeTruthy();
});

it('cancels an in-flight peer request when its caller aborts', async () => {
  const controller = new AbortController();
  const origin = await startPeer(() => controller.abort(new Error('peer_request_cancelled')));
  await expect(lanPeerHttp.fetch(`${origin}/companion/discovery`, { signal: controller.signal }))
    .rejects.toThrow('peer_request_cancelled');
});

it('keeps the authenticated response size limit after fetching from a real peer', async () => {
  const origin = await startPeer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/vnd.foliole.workgroup-aead+json' });
    response.end(Buffer.alloc(65));
  });
  const response = await lanPeerHttp.fetch(`${origin}/companion/resource-availability`);
  await expect(readDesktopWorkgroupResponse({
    contentType: 'application/json', groupId: 'group', maxEnvelopeBytes: 64,
    method: 'GET', pathWithQuery: '/companion/resource-availability', response
  })).rejects.toThrow('workgroup_aead_response_limit_exceeded');
});
