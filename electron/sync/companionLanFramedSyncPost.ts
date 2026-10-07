import type http from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import type { FramedSyncSessionContext } from '../../lib/core/sync/framedSyncSession.js';

import { authenticateCompanionRequest } from './companionRequestAuth.js';
import { withVerifiedFramedHttpBody } from './desktopFramedSyncHttpBody.js';
import {
  encodeFramedSyncStream,
  readFramedSyncStream,
  type FramedSyncStreamBody,
  type FramedSyncWireFrame
} from './desktopFramedSyncStream.js';

export const FRAMED_SYNC_PATH = '/companion/framed-sync';
export const FRAMED_SYNC_CONTENT_TYPE = 'application/vnd.foliole.framed-sync';
export const FRAMED_SYNC_BODY_SHA256_HEADER = 'x-foliole-body-sha256';
export const FRAMED_SYNC_LIBRARY_EPOCH_HEADER = 'x-foliole-library-epoch';
export const FRAMED_SYNC_DEVICE_ID_HEADER = 'x-foliole-device-id';
const IDENTITY_PARAMS = Object.freeze({
  initiatorDeviceId: 'initiator_device_id',
  initiatorLibraryEpoch: 'initiator_library_epoch',
  responderDeviceId: 'responder_device_id',
  responderLibraryEpoch: 'responder_library_epoch'
});

type Authenticator = typeof authenticateCompanionRequest;
type AuthenticatedContext = Omit<FramedSyncSessionContext, 'sessionId'>;

export async function handleCompanionLanFramedSyncPost(args: {
  authenticate?: Authenticator;
  localIdentity: Readonly<{ deviceId: string; libraryEpoch: string }>;
  onStream: (input: Readonly<{
    context: AuthenticatedContext;
    stream: FramedSyncStreamBody<FramedSyncWireFrame>;
  }>) => Promise<FramedSyncStreamBody>;
  request: http.IncomingMessage;
  response: http.ServerResponse;
}) {
  const { request, response } = args;
  if (request.method !== 'POST' || pathname(request) !== FRAMED_SYNC_PATH) {
    writeError(response, 404, 'framed_sync_route_not_found');
    return;
  }
  if (!hasContentType(request, FRAMED_SYNC_CONTENT_TYPE)) {
    writeError(response, 415, 'framed_sync_content_type_required');
    return;
  }
  const context = authenticateContext(args);
  if (!context) return;
  const contentLength = readHeader(request, 'content-length');
  try {
    await withVerifiedFramedHttpBody({
      body: request,
      expectedSha256: readHeader(request, FRAMED_SYNC_BODY_SHA256_HEADER)!,
      ...(contentLength === null ? {} : { contentLength })
    }, async (body) => {
      const stream = await readFramedSyncStream(body);
      const reply = await args.onStream({ context, stream });
      response.writeHead(200, {
        'Content-Type': FRAMED_SYNC_CONTENT_TYPE,
        [FRAMED_SYNC_DEVICE_ID_HEADER]: args.localIdentity.deviceId,
        [FRAMED_SYNC_LIBRARY_EPOCH_HEADER]: args.localIdentity.libraryEpoch
      });
      await pipeline(Readable.from(encodeFramedSyncStream(reply)), response);
    });
  } catch (error) {
    if (response.headersSent) {
      response.destroy(error instanceof Error ? error : undefined);
      return;
    }
    const message = error instanceof Error ? error.message : 'framed_sync_request_invalid';
    writeError(response, message === 'invalid_signature' ? 401 : message === 'wire_frame_limit_exceeded' ? 413 : 400, message);
  }
}

function authenticateContext(args: {
  authenticate?: Authenticator;
  localIdentity: Readonly<{ deviceId: string; libraryEpoch: string }>;
  request: http.IncomingMessage;
  response: http.ServerResponse;
}): AuthenticatedContext | null {
  const { request, response } = args;
  const identity = readIdentity(new URL(request.url ?? '/', 'http://127.0.0.1'));
  const groupId = readHeader(request, 'x-sync-group-id');
  const bodySha256 = readHeader(request, FRAMED_SYNC_BODY_SHA256_HEADER);
  if (!identity || !groupId) {
    writeError(response, 400, 'framed_sync_identity_context_required');
    return null;
  }
  if (!bodySha256) {
    writeError(response, 401, 'missing_headers');
    return null;
  }
  if (!/^[0-9a-f]{64}$/u.test(bodySha256)) {
    writeError(response, 401, 'invalid_signature');
    return null;
  }
  if (identity.responderDeviceId !== args.localIdentity.deviceId ||
      identity.responderLibraryEpoch !== args.localIdentity.libraryEpoch) {
    writeError(response, 409, 'framed_sync_responder_identity_mismatch');
    return null;
  }
  const auth = (args.authenticate ?? authenticateCompanionRequest)({
    bodySha256,
    request,
    requireMemberState: true
  });
  if (!auth.ok) {
    writeError(response, auth.status_code, auth.error);
    return null;
  }
  if (identity.initiatorDeviceId !== auth.device_id) {
    writeError(response, 401, 'framed_sync_initiator_identity_mismatch');
    return null;
  }
  return {
    groupId,
    initiatorDeviceId: auth.device_id,
    initiatorLibraryEpoch: identity.initiatorLibraryEpoch,
    protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    responderDeviceId: args.localIdentity.deviceId,
    responderLibraryEpoch: args.localIdentity.libraryEpoch
  };
}

export function framedSyncPathWithIdentity(args: Readonly<{
  initiatorDeviceId: string;
  initiatorLibraryEpoch: string;
  pathWithQuery?: string;
  responderDeviceId: string;
  responderLibraryEpoch: string;
}>) {
  const url = new URL(args.pathWithQuery ?? FRAMED_SYNC_PATH, 'http://127.0.0.1');
  url.searchParams.set(IDENTITY_PARAMS.initiatorDeviceId, args.initiatorDeviceId);
  url.searchParams.set(IDENTITY_PARAMS.initiatorLibraryEpoch, args.initiatorLibraryEpoch);
  url.searchParams.set(IDENTITY_PARAMS.responderDeviceId, args.responderDeviceId);
  url.searchParams.set(IDENTITY_PARAMS.responderLibraryEpoch, args.responderLibraryEpoch);
  return `${url.pathname}${url.search}`;
}

function pathname(request: http.IncomingMessage) {
  return new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
}

function hasContentType(request: http.IncomingMessage, expected: string) {
  const value = readHeader(request, 'content-type');
  return value?.split(';', 1)[0]?.trim().toLowerCase() === expected;
}

function readIdentity(url: URL) {
  const read = (name: string) => url.searchParams.get(name)?.trim() || null;
  const initiatorDeviceId = read(IDENTITY_PARAMS.initiatorDeviceId);
  const initiatorLibraryEpoch = read(IDENTITY_PARAMS.initiatorLibraryEpoch);
  const responderDeviceId = read(IDENTITY_PARAMS.responderDeviceId);
  const responderLibraryEpoch = read(IDENTITY_PARAMS.responderLibraryEpoch);
  if (!initiatorDeviceId || !initiatorLibraryEpoch || !responderDeviceId ||
      !responderLibraryEpoch) return null;
  return { initiatorDeviceId, initiatorLibraryEpoch, responderDeviceId, responderLibraryEpoch };
}

function readHeader(request: http.IncomingMessage, name: string) {
  const value = request.headers[name];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function writeError(response: http.ServerResponse, statusCode: number, error: string) {
  const body = Buffer.from(JSON.stringify({ error }));
  response.writeHead(statusCode, {
    'Content-Length': body.byteLength,
    'Content-Type': 'application/json; charset=utf-8'
  });
  response.end(body);
}
