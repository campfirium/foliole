import os from 'node:os';

import { Bonjour } from 'bonjour-service';

import { serializeSyncProtocolTxt } from '../../lib/platform/syncProtocolContract.js';

import { loadSyncGroupRuntimeInstanceId } from './syncGroupRuntimeInstance.js';

const COMPANION_SYNC_MDNS_SERVICE_TYPE = 'foliole-sync';
const COMPANION_SYNC_MDNS_STOP_TIMEOUT_MS = 1_000;

type PublishedBonjourService = ReturnType<InstanceType<typeof Bonjour>['publish']>;
type BonjourOptions = NonNullable<ConstructorParameters<typeof Bonjour>[0]> & { interface: string };
type ActiveAdvertisement = {
  input: CompanionMdnsAdvertisementInput;
  runtimes: Array<{
    bonjour: InstanceType<typeof Bonjour>;
    service: PublishedBonjourService;
  }>;
};

let activeAdvertisement: ActiveAdvertisement | null = null;
let factsRevision = 0;
let lifecycleRevision = 0;
let refreshQueue = Promise.resolve();

export interface CompanionMdnsAdvertisementInput {
  appVersion: string;
  onWarning?: (error: unknown) => void;
  deviceId: string;
  port: number;
  groupDisplayName: string;
  groupId: string;
  groupTag: string;
}

function runtimeSuffix(runtimeInstanceId: string) {
  return runtimeInstanceId.replace(/[^A-Za-z0-9]/gu, '').slice(0, 8) || 'runtime';
}

export function resolveCompanionMdnsIpv4Addresses(
  interfaces = os.networkInterfaces()
) {
  return [...new Set(Object.values(interfaces).flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address))];
}

export function resolveCompanionMdnsHost(
  hostname = os.hostname(),
  runtimeInstanceId: string = loadSyncGroupRuntimeInstanceId()
) {
  const label = hostname.trim().replace(/\.+$/u, '').split('.')[0]
    ?.replace(/[^A-Za-z0-9-]/gu, '-').replace(/^-+|-+$/gu, '');
  const suffix = runtimeSuffix(runtimeInstanceId);
  const hostLimit = Math.max(1, 62 - suffix.length);
  return `${(label || 'foliole-desktop').slice(0, hostLimit)}-${suffix}.local`;
}

export function resolveCompanionMdnsServiceName(
  groupDisplayName: string, runtimeInstanceId: string, revision: number
) {
  const suffix = `${runtimeSuffix(runtimeInstanceId)}-r${revision.toString(36)}`;
  const displayLimit = Math.max(1, 62 - suffix.length);
  return `${Array.from(groupDisplayName).slice(0, displayLimit).join('')}-${suffix}`;
}

export function startCompanionMdnsAdvertisement(input: CompanionMdnsAdvertisementInput) {
  lifecycleRevision += 1;
  stopCompanionMdnsAdvertisement();
  return publishCompanionMdnsAdvertisement(input);
}

function waitForPublishedService(service: PublishedBonjourService, timeoutMs: number) {
  if (service.published) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      service.off('up', onUp);
      service.off('error', onError);
      if (error) reject(error);
      else resolve();
    };
    const onUp = () => finish();
    const onError = (error: Error) => finish(error);
    const timer = setTimeout(() => finish(new Error(
      'mDNS advertisement did not become available.'
    )), timeoutMs);
    service.once('up', onUp);
    service.once('error', onError);
  });
}

export function waitForCompanionMdnsAdvertisement(
  services: PublishedBonjourService[], timeoutMs = 5_000
) {
  return Promise.all(services.map((service) => waitForPublishedService(service, timeoutMs)))
    .then(() => undefined);
}

function publishCompanionMdnsAdvertisement(input: CompanionMdnsAdvertisementInput) {
  const runtimeInstanceId = loadSyncGroupRuntimeInstanceId();
  const reportWarning = (error: unknown) => {
    console.warn('[companion-sync] mDNS advertisement warning', error);
    input.onWarning?.(error);
  };
  const ipv4Addresses = resolveCompanionMdnsIpv4Addresses();
  const interfaces = ipv4Addresses.length > 0 ? ipv4Addresses : [null];
  const runtimes = interfaces.map((networkInterface) => {
    const options = networkInterface ? { interface: networkInterface } as BonjourOptions : undefined;
    const bonjour = new Bonjour(options, reportWarning);
    const service = publishService(bonjour, input, ipv4Addresses, runtimeInstanceId);
    return { bonjour, service };
  });
  activeAdvertisement = { input, runtimes };
  return runtimes.map(({ service }) => service);
}

export function refreshCompanionMdnsAdvertisement() {
  factsRevision += 1;
  const expectedLifecycle = lifecycleRevision;
  refreshQueue = refreshQueue.then(async () => {
    const advertisement = activeAdvertisement;
    if (!advertisement || lifecycleRevision !== expectedLifecycle) return;
    activeAdvertisement = null;
    await stopServices(advertisement);
    if (activeAdvertisement || lifecycleRevision !== expectedLifecycle) {
      advertisement.runtimes.forEach(({ bonjour }) => bonjour.destroy());
      return;
    }
    const ipv4Addresses = resolveCompanionMdnsIpv4Addresses();
    const runtimeInstanceId = loadSyncGroupRuntimeInstanceId();
    activeAdvertisement = { input: advertisement.input,
      runtimes: advertisement.runtimes.map(({ bonjour }) => ({ bonjour,
        service: publishService(bonjour, advertisement.input, ipv4Addresses, runtimeInstanceId)
      })) };
  });
  return refreshQueue;
}

export function stopCompanionMdnsAdvertisement() {
  lifecycleRevision += 1;
  const advertisement = activeAdvertisement;
  activeAdvertisement = null;
  return advertisement ? stopAdvertisement(advertisement) : Promise.resolve();
}

function stopAdvertisement(advertisement: ActiveAdvertisement) {
  return stopServices(advertisement).then(() => {
    advertisement.runtimes.forEach(({ bonjour }) => bonjour.destroy());
  });
}

function stopServices(advertisement: ActiveAdvertisement,
  timeoutMs = COMPANION_SYNC_MDNS_STOP_TIMEOUT_MS) {
  return Promise.all(advertisement.runtimes.map(({ service }) => new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    service.stop?.(finish);
  }))).then(() => undefined);
}

function publishService(bonjour: InstanceType<typeof Bonjour>, input: CompanionMdnsAdvertisementInput,
  ipv4Addresses: string[], runtimeInstanceId: string) {
  return bonjour.publish({ host: resolveCompanionMdnsHost(os.hostname(), runtimeInstanceId),
    name: resolveCompanionMdnsServiceName(input.groupDisplayName, runtimeInstanceId, factsRevision),
    port: input.port, protocol: 'tcp', type: COMPANION_SYNC_MDNS_SERVICE_TYPE,
    txt: { app_version: input.appVersion, device_id: input.deviceId,
      facts_revision: String(factsRevision), group_id: input.groupId, group_tag: input.groupTag,
      ipv4_addresses: ipv4Addresses.join(','), runtime_instance_id: runtimeInstanceId,
      ...serializeSyncProtocolTxt() } });
}
