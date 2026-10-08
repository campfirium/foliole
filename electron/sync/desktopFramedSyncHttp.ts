import http, { type ClientRequest, type IncomingMessage } from 'node:http';
import https from 'node:https';

import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import type { FramedSyncPayloadBudget } from '../../lib/core/sync/framedSyncPayloadBudget.js';
import type { FramedSyncSessionContext } from '../../lib/core/sync/framedSyncSession.js';

import {
  FRAMED_SYNC_BODY_SHA256_HEADER,
  FRAMED_SYNC_CONTENT_TYPE,
  FRAMED_SYNC_DEVICE_ID_HEADER,
  FRAMED_SYNC_LIBRARY_EPOCH_HEADER,
  framedSyncPathWithIdentity
} from './companionLanFramedSyncPost.js';
import { encodeFramedSyncHttpBody, writeDesktopFramedSyncHttpBody } from './desktopFramedSyncHttpWriter.js';
import {
  readFramedSyncStream,
  type FramedSyncWritableBody
} from './desktopFramedSyncStream.js';
import { createDesktopSyncGroupSignedHeaders } from './desktopSyncGroupSignedHeaders.js';

type PostInput = {
  body: FramedSyncWritableBody;
  payloadBudget?: FramedSyncPayloadBudget | undefined;
  endpointUrl: string;
  groupId: string;
  localDeviceId: string;
  localLibraryEpoch: string;
  pathWithQuery: string;
  remoteDeviceId: string;
  remoteLibraryEpoch: string;
  secret: string;
};

export async function postDesktopFramedSync(args: PostInput) {
  const response = await postDesktopFramedSyncBytes(args);
  try {
    const stream = await readFramedSyncStream(response.response, args.payloadBudget, { reuseCiphertext: true });
    return { context: response.context, stream };
  } catch (error) { response.response.destroy(); throw error; }
}

export async function postDesktopFramedSyncBytes(args: PostInput) {
  try { return await postOwnedBody(args); }
  finally { await args.body.dispose?.(); }
}

async function postOwnedBody(args: PostInput) {
  const pathWithQuery = framedSyncPathWithIdentity({
    initiatorDeviceId: args.localDeviceId,
    initiatorLibraryEpoch: args.localLibraryEpoch,
    pathWithQuery: args.pathWithQuery,
    responderDeviceId: args.remoteDeviceId,
    responderLibraryEpoch: args.remoteLibraryEpoch
  });
  const url = new URL(pathWithQuery, ensureTrailingSlash(args.endpointUrl));
  const headers = {
    ...createDesktopSyncGroupSignedHeaders({
      bodySha256: args.body.bodySha256,
      groupId: args.groupId,
      localDeviceId: args.localDeviceId,
      method: 'POST',
      pathWithQuery,
      secret: args.secret
    }),
    Accept: FRAMED_SYNC_CONTENT_TYPE,
    'Content-Length': String(args.body.contentLength),
    'Content-Type': FRAMED_SYNC_CONTENT_TYPE,
    [FRAMED_SYNC_BODY_SHA256_HEADER]: args.body.bodySha256,
  };
  const transport = url.protocol === 'https:' ? https : http;
  const request = transport.request(url, { headers, method: 'POST' });
  const responsePromise = waitForResponse(request);
  const sendPromise = writeDesktopFramedSyncHttpBody(request, encodeFramedSyncHttpBody(args.body));
  const [response] = await Promise.all([responsePromise, sendPromise]).catch(async (error: unknown) => {
    request.destroy(error instanceof Error ? error : undefined);
    await Promise.allSettled([responsePromise, sendPromise]);
    throw error;
  });
  await assertSuccessfulResponse(response, args);
  const context: Omit<FramedSyncSessionContext, 'sessionId'> = {
    groupId: args.groupId,
    initiatorDeviceId: args.localDeviceId,
    initiatorLibraryEpoch: args.localLibraryEpoch,
    protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    responderDeviceId: args.remoteDeviceId,
    responderLibraryEpoch: args.remoteLibraryEpoch
  };
  return { context, response };
}

function ensureTrailingSlash(value: string) {
  return value.endsWith('/') ? value : `${value}/`;
}

function waitForResponse(request: ClientRequest) {
  return new Promise<IncomingMessage>((resolve, reject) => {
    request.once('response', resolve);
    request.once('error', reject);
  });
}

async function assertSuccessfulResponse(response: IncomingMessage, args: {
  remoteDeviceId: string;
  remoteLibraryEpoch: string;
}) {
  if (response.statusCode !== 200) {
    const detail = await readErrorDetail(response);
    throw new Error(`framed_sync_http_${response.statusCode ?? 0}${detail ? `:${detail}` : ''}`);
  }
  if (!hasContentType(response.headers['content-type'], FRAMED_SYNC_CONTENT_TYPE)) {
    response.destroy();
    throw new Error('framed_sync_response_content_type_invalid');
  }
  if (readHeader(response, FRAMED_SYNC_DEVICE_ID_HEADER) !== args.remoteDeviceId ||
      readHeader(response, FRAMED_SYNC_LIBRARY_EPOCH_HEADER) !== args.remoteLibraryEpoch) {
    response.destroy();
    throw new Error('framed_sync_response_identity_mismatch');
  }
}

async function readErrorDetail(response: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of response) {
    size += chunk.length;
    if (size > 64 * 1024) return null;
    chunks.push(Buffer.from(chunk));
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return typeof value === 'object' && value !== null &&
      typeof (value as Record<string, unknown>).error === 'string'
      ? (value as Record<string, string>).error : null;
  } catch {
    return null;
  }
}

function hasContentType(value: string | undefined, expected: string) {
  return value?.split(';', 1)[0]?.trim().toLowerCase() === expected;
}

function readHeader(response: IncomingMessage, name: string) {
  const value = response.headers[name];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
