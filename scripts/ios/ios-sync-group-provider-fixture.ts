import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';

import {
  IOS_ACCEPTANCE_CONTRACT_PEER_ID,
  loadIosAcceptanceContractCorpus
} from './ios-acceptance-contract-corpus.ts';
import {
  type IosContentResourceAcceptanceFixture,
  routeIosContentResourceRequest
} from './ios-content-resource-acceptance-service.ts';
import { createIosSyncGroupProviderContract } from './ios-sync-group-provider-contract.ts';
import { createIosSyncGroupProviderObservations } from './ios-sync-group-provider-observations.ts';
import { createIosSyncGroupScenarioService } from './ios-sync-group-scenario-service.ts';
import {
  type IosSyncPackAcceptanceRoutes
} from './ios-sync-pack-acceptance-routes.ts';

const artifactDir = process.argv[2];
if (!artifactDir) throw new Error('Acceptance artifact directory is required.');
const scenario = process.argv[3] ?? 'sync-group-signed-transport';
const corpusScenario = [
  'content-resource-read', 'foreground-sync-lifecycle', 'state-writeback-runtime', 'sync-pack-runtime'
].includes(scenario);
mkdirSync(artifactDir, { recursive: true });

const observations = createIosSyncGroupProviderObservations();
const provider = createIosSyncGroupProviderContract(observations);
let contentResourceFixture: IosContentResourceAcceptanceFixture | null = null;
let scenarioService: Awaited<ReturnType<typeof createIosSyncGroupScenarioService>> | null = null;
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

async function handleJoinRequest(request: IncomingMessage, response: ServerResponse) {
  const created = await provider.accept(await readJson(request));
  if (scenario === 'sync-pack-runtime') {
    const { createIosSyncPackAcceptanceRoutes } = await import('./ios-sync-pack-acceptance-routes.ts');
    syncPackService = await createIosSyncPackAcceptanceRoutes({
      observations: observations.sync_pack
    });
  } else if (scenario === 'content-resource-read') {
    contentResourceFixture = loadIosAcceptanceContractCorpus().contentResource;
  } else if (scenario === 'state-writeback-runtime' || scenario === 'foreground-sync-lifecycle') {
    scenarioService = await createIosSyncGroupScenarioService({
      artifactDir,
      observations,
      scenario,
      toPeerId: corpusScenario ? IOS_ACCEPTANCE_CONTRACT_PEER_ID : provider.discovery.provider_device_id
    });
  }
  writeObservations();
  send(response, 202, created);
}

async function handleJoinAcceptance(request: IncomingMessage, response: ServerResponse) {
  const payload = await readJson(request);
  const acceptance = provider.collect(String(payload.request_id ?? ''));
  writeObservations();
  send(response, acceptance ? 200 : 409,
    acceptance ?? { error: 'sync_group_join_not_accepted' });
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
    if (!provider.authenticate(request, bodyText)) {
      send(response, 401, { error: 'invalid_signature' });
      return;
    }
    if (scenarioService) {
      const routed = await scenarioService.route({
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
    if (request.method === 'GET' && request.url === '/companion/discovery') {
      send(response, 200, provider.discovery);
    } else if (request.method === 'POST' && request.url === '/sync-group/join-requests') {
      await handleJoinRequest(request, response);
    } else if (request.method === 'POST' && request.url === '/sync-group/join-acceptance') {
      await handleJoinAcceptance(request, response);
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
  scenarioService?.close();
  syncPackService?.close();
  process.exit(0);
}));
