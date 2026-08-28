import os from 'node:os';

import { serializeSyncProtocolTxt } from '../../lib/platform/syncProtocolContract.js';

import { startDesktopDnsSdRegistration, type DesktopDnsSdEvent } from './desktopDnsSd.js';
import { loadSyncGroupRuntimeInstanceId } from './syncGroupRuntimeInstance.js';

type Registration = ReturnType<typeof startDesktopDnsSdRegistration>;
type ActiveAdvertisement = { input: CompanionMdnsAdvertisementInput; registration: Registration };

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

export function resolveCompanionMdnsIpv4Addresses(interfaces = os.networkInterfaces()) {
  return [...new Set(Object.values(interfaces).flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address))];
}

export function resolveCompanionMdnsHost(
  hostname = os.hostname(), runtimeInstanceId: string = loadSyncGroupRuntimeInstanceId()
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
  stopCompanionMdnsAdvertisement();
  const readiness = createRegistration(input);
  activeAdvertisement = { input, registration: readiness.registration };
  return readiness;
}

export function refreshCompanionMdnsAdvertisement() {
  factsRevision += 1;
  const expectedLifecycle = lifecycleRevision;
  refreshQueue = refreshQueue.then(() => {
    const advertisement = activeAdvertisement;
    if (!advertisement || lifecycleRevision !== expectedLifecycle) return;
    advertisement.registration.stop();
    if (activeAdvertisement !== advertisement || lifecycleRevision !== expectedLifecycle) return;
    const next = createRegistration(advertisement.input);
    activeAdvertisement = { input: advertisement.input, registration: next.registration };
    return next.ready;
  });
  return refreshQueue;
}

export function stopCompanionMdnsAdvertisement() {
  lifecycleRevision += 1;
  const advertisement = activeAdvertisement;
  activeAdvertisement = null;
  advertisement?.registration.stop();
  return Promise.resolve();
}

function createRegistration(input: CompanionMdnsAdvertisementInput) {
  const runtimeInstanceId = loadSyncGroupRuntimeInstanceId();
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const consume = (event: DesktopDnsSdEvent | { kind: 'registered' }) => {
    if (event.kind === 'registered') resolveReady();
    if (event.kind === 'error') {
      const error = new Error(`${event.code}: ${event.message}`);
      input.onWarning?.(error);
      rejectReady(error);
    }
  };
  const ipv4Addresses = resolveCompanionMdnsIpv4Addresses();
  const registration = startDesktopDnsSdRegistration({
    name: resolveCompanionMdnsServiceName(input.groupDisplayName, runtimeInstanceId, factsRevision),
    port: input.port,
    txt: { app_version: input.appVersion, device_id: input.deviceId,
      facts_revision: String(factsRevision), group_id: input.groupId, group_tag: input.groupTag,
      ipv4_addresses: ipv4Addresses.join(','), runtime_instance_id: runtimeInstanceId,
      ...serializeSyncProtocolTxt() }
  }, consume);
  return { ready, registration };
}

export function waitForCompanionMdnsAdvertisement(
  advertisement: ReturnType<typeof startCompanionMdnsAdvertisement>
) {
  return advertisement.ready;
}
