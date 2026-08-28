import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';

import { app } from 'electron';

import {
  IOS_ACCEPTANCE_CONTRACT_PEER_ID,
  loadIosAcceptanceContractCorpus
} from './ios-acceptance-contract-corpus.ts';
import {
  type IosContentResourceAcceptanceFixture,
  routeIosContentResourceRequest
} from './ios-content-resource-acceptance-service.ts';
import { createIosSyncGroupProviderContract } from './ios-sync-group-provider-contract.ts';
import {
  readProviderJson,
  readProviderText,
  sendProviderResponse
} from './ios-sync-group-provider-http.ts';
import { createIosSyncGroupProviderObservations } from './ios-sync-group-provider-observations.ts';
import {
  hostedRegistrationInput,
  registerHostedProvider
} from './ios-sync-group-provider-registration.ts';
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
const require = createRequire(import.meta.url);
const dnsSd = require(path.join(process.cwd(), 'scripts/desktop/desktop-dnssd-harness-loader.cjs')) as {
  register: Parameters<typeof registerHostedProvider>[0];
};
let contentResourceFixture: IosContentResourceAcceptanceFixture | null = null;
let scenarioService: Awaited<ReturnType<typeof createIosSyncGroupScenarioService>> | null = null;
let syncPackService: IosSyncPackAcceptanceRoutes | null = null;
let registration: ReturnType<typeof registerHostedProvider> | null = null;
let stopping = false;

function writeObservations() {
  writeFileSync(path.join(artifactDir, 'service-observations.json'), `${JSON.stringify(observations, null, 2)}\n`);
}

async function handleJoinRequest(request: IncomingMessage, response: ServerResponse) {
  const created = await provider.accept(await readProviderJson(request));
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
  sendProviderResponse(response, 202, created);
}

async function handleJoinAcceptance(request: IncomingMessage, response: ServerResponse) {
  const payload = await readProviderJson(request);
  const acceptance = provider.collect(String(payload.request_id ?? ''));
  writeObservations();
  sendProviderResponse(response, acceptance ? 200 : 409,
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
      sendProviderResponse(response, 200, { reached: true });
      return;
    }
    const bodyText = request.method === 'POST' ? await readProviderText(request) : '';
    if (!provider.authenticate(request, bodyText)) {
      writeObservations();
      sendProviderResponse(response, 401, { error: 'invalid_signature' });
      return;
    }
    writeObservations();
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
      sendProviderResponse(response, 302, { redirected: true }, { Location: '/acceptance/redirect-target' });
      return;
    }
    if (request.url === '/acceptance/error') {
      sendProviderResponse(response, 503, { error: 'acceptance_failure' });
      return;
    }
    sendProviderResponse(response, 200, { ok: true });
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/companion/discovery') {
      sendProviderResponse(response, 200, provider.discovery);
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
    sendProviderResponse(response, 500, { error: message });
  }
});

async function start() {
  await app.whenReady();
  server.listen(0, () => void registerListener());
}

async function registerListener() {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Acceptance server address is unavailable.');
  const input = hostedRegistrationInput(provider.discovery, address.port);
  observations.registration.port = address.port;
  observations.registration.runtime_instance_id = provider.discovery.runtime_instance_id;
  observations.registration.service_name = input.name;
  writeObservations();
  registration = registerHostedProvider(dnsSd.register, input, failRegistration);
  try {
    await registration.ready;
    observations.registration.registered = true;
    writeObservations();
    writeFileSync(path.join(artifactDir, 'service.json'), `${JSON.stringify({
      registered: true,
      runtime_instance_id: provider.discovery.runtime_instance_id,
      service_name: input.name
    })}\n`);
    process.send?.({ kind: 'registered', runtime_instance_id: provider.discovery.runtime_instance_id });
  } catch (error) {
    failRegistration(error instanceof Error ? error : new Error(String(error)));
  }
}

function failRegistration(error: Error) {
  observations.last_error = error.message;
  observations.registration.error = error.message;
  writeObservations();
  process.send?.({ code: error.message, kind: 'error' });
  void stop(1);
}

async function stop(exitCode: number) {
  if (stopping) return;
  stopping = true;
  registration?.cancel();
  observations.registration.cancelled = registration !== null;
  await new Promise<void>((resolve) => {
    if (!server.listening) return resolve();
    server.close(() => resolve());
  });
  observations.registration.closed = true;
  writeObservations();
  scenarioService?.close();
  syncPackService?.close();
  process.send?.({ kind: 'stopped' });
  app.exit(exitCode);
}

server.on('error', (error) => failRegistration(error));
process.on('message', (message) => {
  if ((message as { kind?: string })?.kind === 'stop') void stop(0);
});
process.on('SIGTERM', () => void stop(0));
void start().catch((error) => failRegistration(error instanceof Error ? error : new Error(String(error))));
