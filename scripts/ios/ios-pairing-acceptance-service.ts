import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
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

import {
  IOS_ACCEPTANCE_DESKTOP_PEER_ID,
  IOS_ACCEPTANCE_CONTRACT_PEER_ID,
  loadIosAcceptanceContractCorpus
} from './ios-acceptance-contract-corpus.ts';
import {
  type IosContentResourceAcceptanceFixture,
  routeIosContentResourceRequest
} from './ios-content-resource-acceptance-service.ts';
import { createIosPairingAcceptanceObservations } from './ios-pairing-acceptance-observations.ts';
import { createIosPairingSyncScenarioService } from './ios-pairing-sync-scenario-service.ts';
import {
  type IosSyncPackAcceptanceRoutes
} from './ios-sync-pack-acceptance-routes.ts';

const artifactDir = process.argv[2];
if (!artifactDir) throw new Error('Acceptance artifact directory is required.');
const scenario = process.argv[3] ?? 'pairing-signed-transport';
const corpusScenario = [
  'content-resource-read', 'foreground-sync-lifecycle', 'state-writeback-runtime', 'sync-pack-runtime'
].includes(scenario);
mkdirSync(artifactDir, { recursive: true });

const observations = createIosPairingAcceptanceObservations();
let clientPublicKey = '';
let authorizationId = '';
let requestId = '';
const credentialSecret = randomBytes(32).toString('base64url');
let contentResourceFixture: IosContentResourceAcceptanceFixture | null = null;
let pairingSyncScenarioService: Awaited<ReturnType<typeof createIosPairingSyncScenarioService>> | null = null;
let syncPackService: IosSyncPackAcceptanceRoutes | null = null;

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
  const valid = read('x-authorization-id') === authorizationId
    && verifyCompanionRequestSignature({
      bodyText,
      method: request.method ?? 'GET',
      nonce: read('x-nonce'),
      pathWithQuery: request.url ?? '/',
      secret: credentialSecret,
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
  const hostName = typeof payload.host_name === 'string' ? payload.host_name.trim() : '';
  const hostPlatform = typeof payload.host_platform === 'string' ? payload.host_platform.trim() : '';
  if (!hostName || !hostPlatform || !isSupportedPairingPublicKey(clientPublicKey)
      || compatibility.status !== 'compatible') {
    send(response, 400, { error: 'invalid_pair_request' });
    return;
  }
  requestId = randomUUID();
  authorizationId = corpusScenario ? IOS_ACCEPTANCE_CONTRACT_PEER_ID : requestId;
  if (scenario === 'sync-pack-runtime') {
    const { createIosSyncPackAcceptanceRoutes } = await import('./ios-sync-pack-acceptance-routes.ts');
    syncPackService = await createIosSyncPackAcceptanceRoutes({
      observations: observations.sync_pack
    });
  } else if (scenario === 'content-resource-read') {
    contentResourceFixture = loadIosAcceptanceContractCorpus().contentResource;
  } else if (scenario === 'state-writeback-runtime' || scenario === 'foreground-sync-lifecycle') {
    pairingSyncScenarioService = await createIosPairingSyncScenarioService({
      artifactDir,
      observations,
      scenario,
      toPeerId: authorizationId
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
    authorization_id: authorizationId,
    encrypted_credential_secret: await encryptCompanionPairingSecret({
      clientPublicKey, credentialSecret
    }),
    host_name: 'Acceptance iPhone',
    host_platform: 'ios-capacitor',
    paired_at: new Date().toISOString(),
    peer_id: IOS_ACCEPTANCE_DESKTOP_PEER_ID
  });
}

async function routeSyncPackRequest(
  request: IncomingMessage,
  response: ServerResponse,
  bodyText: string
) {
  if (!syncPackService) return false;
  const handled = await syncPackService.handle({
    bodyText,
    method: request.method ?? 'GET',
    url: request.url ?? '/'
  }, response);
  writeObservations();
  return handled;
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
    if (pairingSyncScenarioService) {
      const routed = await pairingSyncScenarioService.route({
        bodyText,
        method: request.method ?? 'GET',
        url: request.url ?? '/'
      });
      if (routed) {
        writeObservations();
        response.writeHead(routed.status ?? 200, { 'Content-Type': routed.contentType });
        response.end(routed.body);
        return;
      }
    }
    if (await routeSyncPackRequest(request, response, bodyText)) return;
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
    const message = error instanceof Error ? error.message : String(error);
    observations.last_error = message;
    writeObservations();
    send(response, 500, { error: message });
  }
});

const lifecycleScenario = scenario === 'foreground-sync-lifecycle';
const endpointHost = lifecycleScenario ? '[::1]' : '127.0.0.1';
server.listen(0, lifecycleScenario ? '::1' : '127.0.0.1', () => {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Acceptance server address is unavailable.');
  writeObservations();
  writeFileSync(path.join(artifactDir, 'service.json'), `${JSON.stringify({ endpoint: `http://${endpointHost}:${address.port}` })}\n`);
});

process.on('SIGTERM', () => server.close(() => {
  pairingSyncScenarioService?.close();
  syncPackService?.close();
  process.exit(0);
}));
