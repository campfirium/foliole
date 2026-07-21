import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';

import {
  encryptCompanionPairingSecret,
  isSupportedPairingPublicKey
} from '../../electron/sync/companionPairingEncryption.ts';
import { verifyCompanionRequestSignature } from '../../electron/sync/companionRequestSignature.ts';
import {
  CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
  evaluateSyncProtocolCompatibility
} from '../../lib/platform/syncProtocolContract.ts';

import type { IosContentResourceAcceptanceFixture } from './ios-content-resource-acceptance-fixture.ts';
import {
  createIosContentResourceObservations,
  routeIosContentResourceRequest
} from './ios-content-resource-acceptance-service.ts';
import {
  type createIosStateWritebackAcceptanceService
} from './ios-state-writeback-acceptance-service.ts';
import { createIosStateWritebackObservations } from './ios-state-writeback-acceptance-observations.ts';

const artifactDir = process.argv[2];
if (!artifactDir) throw new Error('Acceptance artifact directory is required.');
const scenario = process.argv[3] ?? 'pairing-signed-transport';
mkdirSync(artifactDir, { recursive: true });

const observations = {
  content_resource: createIosContentResourceObservations(),
  pair_completed: false,
  pair_requested: false,
  redirect_target_hits: 0,
  signed_request_count: 0,
  signature_headers_valid: false,
  state_writeback: createIosStateWritebackObservations()
};
let clientPublicKey = '';
let deviceId = '';
let requestId = '';
const deviceSecret = randomBytes(32).toString('base64url');
let syncPackPaths: Record<string, string> = {};
let contentResourceFixture: IosContentResourceAcceptanceFixture | null = null;
let stateWritebackService: Awaited<ReturnType<typeof createIosStateWritebackAcceptanceService>> | null = null;

function writeObservations() {
  writeFileSync(path.join(artifactDir, 'service-observations.json'), `${JSON.stringify(observations, null, 2)}\n`);
}

function send(response: ServerResponse, status: number, payload: unknown, headers: Record<string, string> = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  response.end(JSON.stringify(payload));
}

async function readJson(request: IncomingMessage) {
  return JSON.parse(await readText(request)) as Record<string, unknown>;
}

async function readText(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

function signed(request: IncomingMessage, bodyText = '') {
  const read = (name: string) => typeof request.headers[name] === 'string' ? request.headers[name] : '';
  const valid = read('x-device-id') === deviceId && verifyCompanionRequestSignature({
    bodyText,
    method: request.method ?? 'GET',
    nonce: read('x-nonce'),
    pathWithQuery: request.url ?? '/',
    secret: deviceSecret,
    signature: read('x-signature'),
    timestamp: read('x-timestamp')
  });
  observations.signature_headers_valid ||= valid;
  if (valid) observations.signed_request_count += 1;
  writeObservations();
  return valid;
}

async function handlePairRequestCreate(request: IncomingMessage, response: ServerResponse) {
  const payload = await readJson(request);
  const compatibility = evaluateSyncProtocolCompatibility(payload.protocol);
  clientPublicKey = typeof payload.pairing_public_key === 'string' ? payload.pairing_public_key : '';
  deviceId = typeof payload.device_id === 'string' ? payload.device_id : '';
  if (!deviceId || !isSupportedPairingPublicKey(clientPublicKey) || compatibility.status !== 'compatible') {
    send(response, 400, { error: 'invalid_pair_request' });
    return;
  }
  requestId = randomUUID();
  if (scenario === 'sync-pack-runtime') {
    const { createIosSyncPackAcceptanceFixture } = await import('./ios-sync-pack-acceptance-fixture.ts');
    const fixture = await createIosSyncPackAcceptanceFixture({
      outputDirectory: path.join(artifactDir, 'sync-packs'),
      toPeerId: deviceId
    });
    syncPackPaths = {
      '/acceptance/sync-pack/corrupt-envelope': fixture.corruptEnvelopePath,
      '/acceptance/sync-pack/cursor-gap': fixture.cursorGapPath,
      '/acceptance/sync-pack/legal': fixture.legalPath,
      '/acceptance/sync-pack/wrong-target': fixture.wrongTargetPath
    };
  } else if (scenario === 'content-resource-read') {
    const { createIosContentResourceAcceptanceFixture } = await import('./ios-content-resource-acceptance-fixture.ts');
    contentResourceFixture = await createIosContentResourceAcceptanceFixture({
      outputDirectory: path.join(artifactDir, 'content-resources'),
      toPeerId: deviceId
    });
  } else if (scenario === 'state-writeback-runtime') {
    const { createIosStateWritebackAcceptanceService } = await import('./ios-state-writeback-acceptance-service.ts');
    stateWritebackService = await createIosStateWritebackAcceptanceService({
      observations: observations.state_writeback,
      outputDirectory: path.join(artifactDir, 'state-writeback-desktop'),
      toPeerId: deviceId
    });
  }
  observations.pair_requested = true;
  writeObservations();
  send(response, 202, {
    compatibility,
    desktop_protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
    expires_at: new Date(Date.now() + 120_000).toISOString(),
    pair_request_id: requestId,
    status: 'pending'
  });
}

async function handlePairCompletion(request: IncomingMessage, response: ServerResponse) {
  const payload = await readJson(request);
  if (payload.pair_request_id !== requestId) {
    send(response, 404, { error: 'pair_request_not_found' });
    return;
  }
  observations.pair_completed = true;
  writeObservations();
  send(response, 200, {
    compatibility: evaluateSyncProtocolCompatibility(CURRENT_SYNC_PROTOCOL_DESCRIPTOR),
    desktop_protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
    device_id: deviceId,
    encrypted_device_secret: await encryptCompanionPairingSecret({ clientPublicKey, deviceSecret }),
    paired_at: new Date().toISOString(),
    peer_id: 'acceptance-desktop'
  });
}

async function handleSignedRequest(request: IncomingMessage, response: ServerResponse) {
    if (request.url === '/acceptance/redirect-target') {
      observations.redirect_target_hits += 1;
      writeObservations();
      send(response, 200, { reached: true });
      return;
    }
    const bodyText = request.method === 'POST' ? await readText(request) : '';
    if (!signed(request, bodyText)) {
      send(response, 401, { error: 'invalid_signature' });
      return;
    }
    if (stateWritebackService) {
      const routed = await stateWritebackService.route({
        bodyText,
        method: request.method ?? 'GET',
        url: request.url ?? '/'
      });
      if (routed) {
        writeObservations();
        response.writeHead(200, { 'Content-Type': routed.contentType });
        response.end(routed.body);
        return;
      }
    }
    if (contentResourceFixture) {
      const routed = routeIosContentResourceRequest({
        bodyText,
        fixture: contentResourceFixture,
        method: request.method ?? 'GET',
        observations: observations.content_resource,
        requestUrl: request.url ?? '/'
      });
      if (routed) {
        writeObservations();
        response.writeHead(routed.status, routed.headers);
        response.end(routed.body);
        return;
      }
    }
    const syncPackPath = syncPackPaths[request.url ?? ''];
    if (syncPackPath) {
      response.writeHead(200, { 'Content-Type': 'application/vnd.foliole.sync-pack' });
      response.end(readFileSync(syncPackPath));
      return;
    }
    if (request.url === '/acceptance/redirect') {
      send(response, 302, { redirected: true }, { Location: '/acceptance/redirect-target' });
      return;
    }
    if (request.url === '/acceptance/error') {
      send(response, 503, { error: 'acceptance_failure' });
      return;
    }
    send(response, 200, { ok: true });
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === 'POST' && request.url === '/companion/pair-requests') {
      await handlePairRequestCreate(request, response);
    } else if (request.method === 'POST' && request.url === '/companion/pair') {
      await handlePairCompletion(request, response);
    } else {
      await handleSignedRequest(request, response);
    }
  } catch (error) {
    send(response, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Acceptance server address is unavailable.');
  writeObservations();
  writeFileSync(path.join(artifactDir, 'service.json'), `${JSON.stringify({ endpoint: `http://127.0.0.1:${address.port}` })}\n`);
});

process.on('SIGTERM', () => server.close(() => {
  stateWritebackService?.close();
  process.exit(0);
}));
