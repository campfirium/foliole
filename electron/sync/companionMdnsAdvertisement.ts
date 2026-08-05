import os from 'node:os';

import { Bonjour } from 'bonjour-service';

import { serializeSyncProtocolTxt } from '../../lib/platform/syncProtocolContract.js';

const COMPANION_SYNC_MDNS_SERVICE_TYPE = 'foliole-sync';

type PublishedBonjourService = ReturnType<InstanceType<typeof Bonjour>['publish']>;
type BonjourMdnsOptions = NonNullable<ConstructorParameters<typeof Bonjour>[0]> & {
  interface?: string;
};

type ActiveAdvertisement = {
  bonjour: InstanceType<typeof Bonjour>;
  service: PublishedBonjourService;
};

let activeAdvertisements: ActiveAdvertisement[] = [];

export interface CompanionMdnsAdvertisementInput {
  appVersion: string;
  onWarning?: (error: unknown) => void;
  peerId: string;
  port: number;
}

export function collectCompanionMdnsInterfaceAddresses(
  interfaces = os.networkInterfaces()
) {
  const addresses = Object.values(interfaces)
    .flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === 'IPv4' && !entry.internal)
    .filter((entry) => entry.mac !== '00:00:00:00:00:00')
    .map((entry) => entry.address);
  return [...new Set(addresses)];
}

export function startCompanionMdnsAdvertisement(input: CompanionMdnsAdvertisementInput) {
  stopCompanionMdnsAdvertisement();
  const reportWarning = (error: unknown) => {
    console.warn('[companion-sync] mDNS advertisement warning', error);
    input.onWarning?.(error);
  };
  const addresses = collectCompanionMdnsInterfaceAddresses();
  const targets = addresses.length > 0 ? addresses : [undefined];
  activeAdvertisements = targets.map((interfaceAddress) => {
    const options: BonjourMdnsOptions | undefined = interfaceAddress ? { interface: interfaceAddress } : undefined;
    const bonjour = new Bonjour(options, reportWarning);
    const service = bonjour.publish({
      name: 'Foliole Desktop',
      port: input.port,
      protocol: 'tcp',
      txt: {
        app_version: input.appVersion,
        peer_id: input.peerId,
        ...serializeSyncProtocolTxt()
      },
      type: COMPANION_SYNC_MDNS_SERVICE_TYPE
    });
    return { bonjour, service };
  });
  return activeAdvertisements.map(({ service }) => service);
}

export function stopCompanionMdnsAdvertisement() {
  const advertisements = activeAdvertisements;
  activeAdvertisements = [];
  advertisements.forEach(({ bonjour, service }) => {
    service.stop?.();
    bonjour.destroy();
  });
}
