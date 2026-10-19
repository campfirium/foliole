import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { type IncomingMessage, type ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';

import { app } from 'electron';

import { closeDatabaseConnection } from '../../electron/database/connection.js';
import { handleProductionCompanionFramedSyncPost } from '../../electron/sync/companionLanFramedSyncRoute.js';
import { handleCompanionSyncSession } from '../../electron/sync/companionLanSyncSession.js';
import { closeDesktopSyncChangeSessions } from '../../electron/sync/desktopSyncChangeSessions.js';

import { createIosForegroundSyncLifecycleService } from './ios-foreground-sync-lifecycle-service.ts';
import { createIosHostedRequestLibrary, initializeIosHostedRequestLibrary } from './ios-hosted-request-library.js';
import { createIosHostedRequestScenario } from './ios-hosted-request-scenario.js';
import { createIosSyncGroupProviderContract } from './ios-sync-group-provider-contract.ts';
import {
  closeProviderHttpServer,
  createProviderHttpServer,
  readProviderJson,
  readProviderText,
  sendProviderResponse
} from './ios-sync-group-provider-http.ts';
import { createIosSyncGroupProviderObservations } from './ios-sync-group-provider-observations.ts';
import {
  hostedRegistrationInput,
  registerHostedProvider
} from './ios-sync-group-provider-registration.ts';
import { sendSignedProviderJson } from './ios-sync-group-provider-response.ts';

const artifactDir = process.argv[2];
if (!artifactDir) throw new Error('Acceptance artifact directory is required.');
const scenario = process.argv[3] ?? 'sync-group-signed-transport';
const corpusScenario = [
  'content-resource-read', 'foreground-sync-lifecycle', 'state-writeback-runtime', 'sync-pack-runtime'
].includes(scenario);
mkdirSync(artifactDir, { recursive: true });

const observations = createIosSyncGroupProviderObservations();
const workgroupKey = randomBytes(32).toString('base64url');
let requestLibrary: Awaited<ReturnType<typeof createIosHostedRequestLibrary>> | null = null;
const provider = createIosSyncGroupProviderContract(observations, { workgroupKey,
  registerAcceptedDevice: async device => {
    if (!requestLibrary) throw new Error('ios_hosted_request_library_not_ready');
    await requestLibrary.registerAcceptedDevice(device);
  } });
const require = createRequire(import.meta.url);
const dnsSd = require(path.join(process.cwd(), 'scripts/desktop/desktop-dnssd-harness-loader.cjs')) as {
  register: Parameters<typeof registerHostedProvider>[0];
};
let registration: ReturnType<typeof registerHostedProvider> | null = null;
let stopping = false;
const usesRequestScenario = corpusScenario;
const requestScenario = createIosHostedRequestScenario(provider.discovery.provider_device_id, observations.sync_pack, {
  seed: scenario === 'content-resource-read' ? 'contentResource' : scenario === 'sync-pack-runtime' ? 'legal' : 'stateInitial',
  stateObservations: observations.state_writeback
});
const lifecycleService = createIosForegroundSyncLifecycleService({
  artifactDir, observations: observations.foreground_sync_lifecycle, route: async () => null
});

function writeObservations() {
  writeFileSync(path.join(artifactDir, 'service-observations.json'), `${JSON.stringify(observations, null, 2)}\n`);
}

async function handleJoinRequest(request: IncomingMessage, response: ServerResponse) {
  const created = await provider.accept(await readProviderJson(request));
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

async function handleSignedRequest(request: IncomingMessage, response: ServerResponse) {
  if (request.url === '/acceptance/redirect-target') {
    observations.redirect_target_hits += 1;
    writeObservations();
    sendProviderResponse(response, 200, { reached: true });
    return;
  }
  const wireBodyText = request.method === 'POST' ? await readProviderText(request) : '';
  if (!provider.authenticate(request, wireBodyText)) {
    writeObservations();
    sendProviderResponse(response, 401, { error: 'invalid_signature' });
    return;
  }
  const bodyText = provider.decryptRequest(request, wireBodyText);
  if (request.method === 'POST' && request.url === '/sync-group/member-state') {
    if (!requestLibrary || !provider.acceptedDeviceId()) throw new Error('ios_hosted_request_library_not_ready');
    const result = await requestLibrary.acceptMemberState(bodyText, provider.acceptedDeviceId()!);
    sendSignedProviderJson(provider, request, response, 200, result.state);
    writeObservations();
    return;
  }
  if (request.url === '/acceptance/redirect') {
    sendSignedProviderJson(
      provider, request, response, 302, { redirected: true }, { Location: '/acceptance/redirect-target' }
    );
    return;
  }
  if (request.url === '/acceptance/error') {
    sendSignedProviderJson(provider, request, response, 503, { error: 'acceptance_failure' });
    return;
  }
  sendSignedProviderJson(provider, request, response, 200, { ok: true });
}

async function handleRequestSync(request: IncomingMessage, response: ServerResponse) {
  const execute = async () => {
    if (usesRequestScenario) await requestScenario(request, response);
    else await handleProductionCompanionFramedSyncPost({ deviceId: provider.discovery.provider_device_id, request, response });
    return { body: '', contentType: 'application/json', status: response.statusCode };
  };
  const result = scenario === 'foreground-sync-lifecycle'
    ? await lifecycleService({ bodyText: '', method: request.method ?? 'POST', url: request.url ?? '/' }, execute)
    : await execute();
  if (result && !response.writableEnded) {
    response.writeHead(result.status ?? 200, { 'Content-Type': result.contentType });
    response.end(result.body);
  }
  writeObservations();
}

const server = createProviderHttpServer(async (request, response) => {
  try {
    if (await handleCompanionSyncSession(request, response)) return;
    if (request.method === 'POST' && new URL(request.url ?? '/', 'http://localhost').pathname === '/companion/framed-sync') {
      await handleRequestSync(request, response);
    } else if (request.method === 'GET' && request.url === '/companion/discovery') {
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
  requestLibrary = await initializeIosHostedRequestLibrary(artifactDir, workgroupKey);
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
  await closeProviderHttpServer(server, closeDesktopSyncChangeSessions);
  observations.registration.closed = true;
  writeObservations();
  closeDatabaseConnection();
  process.send?.({ kind: 'stopped' });
  app.exit(exitCode);
}

server.on('error', (error) => failRegistration(error));
process.on('message', (message) => {
  if ((message as { kind?: string })?.kind === 'stop') void stop(0);
});
process.on('SIGTERM', () => void stop(0));
void start().catch((error) => failRegistration(error instanceof Error ? error : new Error(String(error))));
