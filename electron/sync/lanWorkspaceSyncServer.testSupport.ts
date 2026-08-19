import crypto from 'node:crypto';
import type http from 'node:http';
import { Readable, Writable } from 'node:stream';

import { expect } from 'vitest';

import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract.js';

import { createTestPairingKeyPair, decryptTestPairingSecret } from './companionPairingProtocolTestSupport.js';

interface TestRequestArgs {
  body?: unknown;
  bodyText?: string;
  headers?: Record<string, string>;
  method?: string;
  path: string;
}

export interface TestHttpResponse {
  body: Buffer;
  headers: Record<string, string | number>;
  json: <T>() => T;
  status: number;
}

export interface TestPairedDevice {
  device_id: string;
  device_secret: string;
  group_id?: string;
  group_tag?: string;
}

function normalizeHeaders(headers: Record<string, string> = {}) {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
}

function createRequest(args: TestRequestArgs) {
  const body = args.bodyText ?? (args.body === undefined ? '' : JSON.stringify(args.body));
  const request = Readable.from(body ? [Buffer.from(body)] : []) as http.IncomingMessage;
  request.headers = normalizeHeaders(args.headers);
  request.method = args.method ?? 'GET';
  request.url = args.path;
  Object.defineProperty(request, 'socket', { value: { remoteAddress: '127.0.0.1' } });
  return request;
}

function createResponse() {
  const chunks: Buffer[] = [];
  let headers: Record<string, string | number> = {};
  let status = 0;
  const response = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    }
  }) as http.ServerResponse;
  response.writeHead = ((nextStatus: number, nextHeaders?: Record<string, string | number>) => {
    status = nextStatus;
    headers = nextHeaders ?? {};
    return response;
  }) as http.ServerResponse['writeHead'];
  return {
    response,
    result: (): TestHttpResponse => ({
      body: Buffer.concat(chunks),
      headers,
      json: <T>() => JSON.parse(Buffer.concat(chunks).toString('utf8')) as T,
      status
    })
  };
}

export async function requestWorkspaceSyncServer(server: http.Server, args: TestRequestArgs) {
  const listener = server.listeners('request')[0] as http.RequestListener | undefined;
  if (!listener) throw new Error('Workspace sync server has no request listener.');
  const request = createRequest(args);
  const { response, result } = createResponse();
  await listener(request, response);
  return result();
}

export function signWorkspaceSyncRequest(args: {
  deviceId: string;
  groupId?: string;
  method: string;
  pathWithQuery: string;
  secret: string;
}) {
  const timestamp = new Date().toISOString();
  const nonce = crypto.randomUUID();
  const bodyHash = crypto.createHash('sha256').update('').digest('hex');
  const canonical = [args.method, args.pathWithQuery, timestamp, nonce, bodyHash].join('\n');
  return {
    'X-Device-Id': args.deviceId,
    'X-Nonce': nonce,
    'X-Signature': crypto.createHmac('sha256', args.secret).update(canonical).digest('hex'),
    ...(args.groupId ? { 'X-Sync-Group-Id': args.groupId } : {}),
    'X-Timestamp': timestamp
  };
}

export async function pairTestDevice(server: http.Server, workgroup?: {
  groupId: string;
  groupTag: string;
}) {
  const clientKeyPair = await createTestPairingKeyPair();
  const created = await requestWorkspaceSyncServer(server, {
    body: {
      device_id: 'android-test-device',
      device_kind: 'android',
      device_name: 'Pixel Test',
      host_name: 'Pixel Test',
      host_platform: 'android-capacitor',
      ...(workgroup ? {
        group_id: workgroup.groupId,
        group_tag: workgroup.groupTag,
        library_facts: {
          attachment_count: 0, content_blob_count: 0, node_count: 0,
          review_log_count: 0, timeline_id: null
        }
      } : {}),
      pairing_public_key: clientKeyPair.publicKey,
      protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR
    },
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
    path: '/companion/pair-requests'
  });
  expect(created.status).toBe(202);
  const pairRequest = created.json<{ pair_request_id: string }>();
  const { approveCompanionPairRequest } = await import('./companionPairingRequests.js');
  expect(approveCompanionPairRequest(pairRequest.pair_request_id)).toMatchObject({ status: 'approved' });
  const finalized = await requestWorkspaceSyncServer(server, {
    body: { pair_request_id: pairRequest.pair_request_id },
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
    path: '/companion/pair'
  });
  expect(finalized.status).toBe(200);
  const payload = finalized.json<{
    device_id: string;
    encrypted_device_secret: Parameters<typeof decryptTestPairingSecret>[0]['encrypted'];
  }>();
  return {
    device_id: payload.device_id,
    device_secret: await decryptTestPairingSecret({
      encrypted: payload.encrypted_device_secret,
      privateKey: clientKeyPair.privateKey
    }),
    ...(workgroup ? { group_id: workgroup.groupId, group_tag: workgroup.groupTag } : {})
  } satisfies TestPairedDevice;
}
