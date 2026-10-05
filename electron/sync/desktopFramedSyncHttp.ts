import { once } from 'node:events';
import http, { type ClientRequest, type IncomingMessage } from 'node:http';
import https from 'node:https';

import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import type { FramedSyncSessionContext } from '../../lib/core/sync/framedSyncSession.js';

import {
  FRAMED_SYNC_BODY_SHA256_HEADER,
  FRAMED_SYNC_CONTENT_TYPE,
  FRAMED_SYNC_DEVICE_ID_HEADER,
  FRAMED_SYNC_LIBRARY_EPOCH_HEADER,
  framedSyncPathWithIdentity
} from './companionLanFramedSyncPost.js';
import {
  encodeFramedSyncStream,
  readFramedSyncStream,
  type FramedSyncWritableBody
} from './desktopFramedSyncStream.js';
import { createDesktopSyncGroupSignedHeaders } from './desktopSyncGroupSignedHeaders.js';

export async function postDesktopFramedSync(args: {
  body: FramedSyncWritableBody;
  endpointUrl: string;
  groupId: string;
  localDeviceId: string;
  localLibraryEpoch: string;
  pathWithQuery: string;
  remoteDeviceId: string;
  remoteLibraryEpoch: string;
  secret: string;
}) {
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
  const sendPromise = writeBody(request, encodeFramedSyncStream(args.body));
  const [response] = await Promise.all([responsePromise, sendPromise]);
  assertSuccessfulResponse(response, args);
  const stream = await readFramedSyncStream(response);
  const context: Omit<FramedSyncSessionContext, 'sessionId'> = {
    groupId: args.groupId,
    initiatorDeviceId: args.localDeviceId,
    initiatorLibraryEpoch: args.localLibraryEpoch,
    protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    responderDeviceId: args.remoteDeviceId,
    responderLibraryEpoch: args.remoteLibraryEpoch
  };
  return { context, stream };
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

async function writeBody(request: ClientRequest, body: AsyncIterable<Uint8Array>) {
  try {
    for await (const chunk of body) {
      if (!request.write(chunk)) await once(request, 'drain');
    }
    request.end();
  } catch (error) {
    request.destroy(error instanceof Error ? error : undefined);
    throw error;
  }
}

function assertSuccessfulResponse(response: IncomingMessage, args: {
  remoteDeviceId: string;
  remoteLibraryEpoch: string;
}) {
  if (response.statusCode !== 200) {
    response.resume();
    throw new Error(`framed_sync_http_${response.statusCode ?? 0}`);
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

function hasContentType(value: string | undefined, expected: string) {
  return value?.split(';', 1)[0]?.trim().toLowerCase() === expected;
}

function readHeader(response: IncomingMessage, name: string) {
  const value = response.headers[name];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
