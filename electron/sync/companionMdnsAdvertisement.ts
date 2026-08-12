import os from 'node:os';

import { Bonjour } from 'bonjour-service';

import { serializeSyncProtocolTxt } from '../../lib/platform/syncProtocolContract.js';

import { loadSyncGroupRuntimeInstanceId } from './syncGroupRuntimeInstance.js';

const COMPANION_SYNC_MDNS_SERVICE_TYPE = 'foliole-sync';

type PublishedBonjourService = ReturnType<InstanceType<typeof Bonjour>['publish']>;
type ActiveAdvertisement = {
  bonjour: InstanceType<typeof Bonjour>;
  input: CompanionMdnsAdvertisementInput;
  service: PublishedBonjourService;
};

let activeAdvertisement: ActiveAdvertisement | null = null;
let factsRevision = 0;

export interface CompanionMdnsAdvertisementInput {
  appVersion: string;
  onWarning?: (error: unknown) => void;
  peerId: string;
  port: number;
  groupDisplayName: string;
  groupId: string;
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

export function resolveCompanionMdnsServiceName(groupDisplayName: string, runtimeInstanceId: string) {
  const suffix = runtimeSuffix(runtimeInstanceId);
  const displayLimit = Math.max(1, 62 - suffix.length);
  return `${Array.from(groupDisplayName).slice(0, displayLimit).join('')}-${suffix}`;
}

export function startCompanionMdnsAdvertisement(input: CompanionMdnsAdvertisementInput) {
  stopCompanionMdnsAdvertisement();
  const runtimeInstanceId = loadSyncGroupRuntimeInstanceId();
  const reportWarning = (error: unknown) => {
    console.warn('[companion-sync] mDNS advertisement warning', error);
    input.onWarning?.(error);
  };
  const bonjour = new Bonjour(undefined, reportWarning);
  const service = bonjour.publish({
    host: resolveCompanionMdnsHost(os.hostname(), runtimeInstanceId),
    name: resolveCompanionMdnsServiceName(input.groupDisplayName, runtimeInstanceId),
    port: input.port,
    protocol: 'tcp',
    txt: {
      app_version: input.appVersion,
      facts_revision: String(factsRevision),
      group_id: input.groupId,
      ipv4_addresses: resolveCompanionMdnsIpv4Addresses().join(','),
      peer_id: input.peerId,
      runtime_instance_id: runtimeInstanceId,
      timeline_id: input.timelineId,
      ...serializeSyncProtocolTxt()
    },
    type: COMPANION_SYNC_MDNS_SERVICE_TYPE
  });
  activeAdvertisement = { bonjour, input, service };
  return [service];
}

export function refreshCompanionMdnsAdvertisement() {
  const input = activeAdvertisement?.input;
  if (!input) return;
  factsRevision += 1;
  startCompanionMdnsAdvertisement(input);
}

export function stopCompanionMdnsAdvertisement() {
  const advertisement = activeAdvertisement;
  activeAdvertisement = null;
  advertisement?.service.stop?.();
  advertisement?.bonjour.destroy();
}
