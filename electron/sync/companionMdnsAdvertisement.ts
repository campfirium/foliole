import os from 'node:os';

import { Bonjour } from 'bonjour-service';

import { serializeSyncProtocolTxt } from '../../lib/platform/syncProtocolContract.js';

const COMPANION_SYNC_MDNS_SERVICE_TYPE = 'foliole-sync';

type PublishedBonjourService = ReturnType<InstanceType<typeof Bonjour>['publish']>;
type ActiveAdvertisement = {
  bonjour: InstanceType<typeof Bonjour>;
  service: PublishedBonjourService;
};

let activeAdvertisement: ActiveAdvertisement | null = null;

export interface CompanionMdnsAdvertisementInput {
  appVersion: string;
  onWarning?: (error: unknown) => void;
  peerId: string;
  port: number;
  groupDisplayName: string;
  groupId: string;
  timelineId: string;
}

export function resolveCompanionMdnsHost(hostname = os.hostname()) {
  const label = hostname.trim().replace(/\.+$/u, '').split('.')[0]
    ?.replace(/[^A-Za-z0-9-]/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 63);
  return `${label || 'foliole-desktop'}.local`;
}

export function startCompanionMdnsAdvertisement(input: CompanionMdnsAdvertisementInput) {
  stopCompanionMdnsAdvertisement();
  const reportWarning = (error: unknown) => {
    console.warn('[companion-sync] mDNS advertisement warning', error);
    input.onWarning?.(error);
  };
  const bonjour = new Bonjour(undefined, reportWarning);
  const service = bonjour.publish({
    host: resolveCompanionMdnsHost(),
    name: input.groupDisplayName,
    port: input.port,
    protocol: 'tcp',
    txt: {
      app_version: input.appVersion,
      group_id: input.groupId,
      peer_id: input.peerId,
      timeline_id: input.timelineId,
      ...serializeSyncProtocolTxt()
    },
    type: COMPANION_SYNC_MDNS_SERVICE_TYPE
  });
  activeAdvertisement = { bonjour, service };
  return [service];
}

export function stopCompanionMdnsAdvertisement() {
  const advertisement = activeAdvertisement;
  activeAdvertisement = null;
  advertisement?.service.stop?.();
  advertisement?.bonjour.destroy();
}
