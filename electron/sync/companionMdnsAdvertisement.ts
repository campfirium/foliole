import os from 'node:os';

import { Bonjour } from 'bonjour-service';

import { serializeSyncProtocolTxt } from '../../lib/platform/syncProtocolContract.js';

import { loadSyncGroupRuntimeInstanceId } from './syncGroupRuntimeInstance.js';

const COMPANION_SYNC_MDNS_SERVICE_TYPE = 'foliole-sync';

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
  peerId: string;
  port: number;
  groupDisplayName: string;
  groupId: string;
  groupTag: string;
  timelineId: string;
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
  groupDisplayName: string, runtimeInstanceId: string, revision = factsRevision
) {
  const suffix = `${runtimeSuffix(runtimeInstanceId)}-${revision.toString(36)}`;
  const displayLimit = Math.max(1, 62 - suffix.length);
  return `${Array.from(groupDisplayName).slice(0, displayLimit).join('')}-${suffix}`;
}

export function startCompanionMdnsAdvertisement(input: CompanionMdnsAdvertisementInput) {
  lifecycleRevision += 1;
  stopCompanionMdnsAdvertisement();
  return publishCompanionMdnsAdvertisement(input);
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
    const service = bonjour.publish({
      host: resolveCompanionMdnsHost(os.hostname(), runtimeInstanceId),
      name: resolveCompanionMdnsServiceName(input.groupDisplayName, runtimeInstanceId, factsRevision),
      port: input.port,
      probe: false,
      protocol: 'tcp',
      txt: {
        app_version: input.appVersion,
        facts_revision: String(factsRevision),
        group_id: input.groupId,
        group_tag: input.groupTag,
        ipv4_addresses: ipv4Addresses.join(','),
        peer_id: input.peerId,
        runtime_instance_id: runtimeInstanceId,
        timeline_id: input.timelineId,
        ...serializeSyncProtocolTxt()
      },
      type: COMPANION_SYNC_MDNS_SERVICE_TYPE
    });
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
    await stopAdvertisement(advertisement);
    if (activeAdvertisement || lifecycleRevision !== expectedLifecycle) return;
    publishCompanionMdnsAdvertisement(advertisement.input);
  });
  return refreshQueue;
}

export function stopCompanionMdnsAdvertisement() {
  lifecycleRevision += 1;
  const advertisement = activeAdvertisement;
  activeAdvertisement = null;
  if (advertisement) void stopAdvertisement(advertisement);
}

function stopAdvertisement(advertisement: ActiveAdvertisement) {
  return Promise.all(advertisement.runtimes.map(({ bonjour, service }) => new Promise<void>((resolve) => {
    service.stop?.(() => {
      bonjour.destroy();
      resolve();
    });
  }))).then(() => undefined);
}
