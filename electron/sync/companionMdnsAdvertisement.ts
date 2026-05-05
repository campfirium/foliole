import { Bonjour, type Service } from 'bonjour-service';

export const COMPANION_SYNC_MDNS_SERVICE_TYPE = 'foliole-sync';

let activeBonjour: InstanceType<typeof Bonjour> | null = null;
let activeService: Service | null = null;

export interface CompanionMdnsAdvertisementInput {
  appVersion: string;
  peerId: string;
  port: number;
}

export function startCompanionMdnsAdvertisement(input: CompanionMdnsAdvertisementInput) {
  stopCompanionMdnsAdvertisement();
  activeBonjour = new Bonjour(undefined, (error: unknown) => {
    console.warn('[companion-sync] mDNS advertisement warning', error);
  });
  activeService = activeBonjour.publish({
    name: 'Foliole Desktop',
    port: input.port,
    protocol: 'tcp',
    txt: {
      app_version: input.appVersion,
      peer_id: input.peerId,
      protocol_version: '1'
    },
    type: COMPANION_SYNC_MDNS_SERVICE_TYPE
  });
  return activeService;
}

export function stopCompanionMdnsAdvertisement() {
  const service = activeService;
  const bonjour = activeBonjour;
  activeService = null;
  activeBonjour = null;
  service?.stop?.();
  bonjour?.destroy();
}

export function getActiveCompanionMdnsAdvertisement() {
  return activeService;
}
