import { Bonjour } from 'bonjour-service';

import {
  resolveCompanionMdnsDiscoveryInterfaces,
  resolveCompanionMdnsInterfaceOptions
} from '../../../electron/sync/companionMdnsNetworkInterfaces.js';

type BonjourOptions = NonNullable<ConstructorParameters<typeof Bonjour>[0]> & {
  bind: string;
  interface: string;
};
type DiscoveredService = Parameters<NonNullable<Parameters<InstanceType<typeof Bonjour>['find']>[1]>>[0];

export async function discoverFolioleService(timeoutMs = 10_000) {
  let resolveService: (service: DiscoveredService) => void = () => {};
  let rejectService: (error: Error) => void = () => {};
  const discovered = new Promise<DiscoveredService>((resolve, reject) => {
    resolveService = resolve;
    rejectService = reject;
  });
  const interfaces = resolveCompanionMdnsDiscoveryInterfaces();
  const runtimes = interfaces.map((networkInterface) => {
    const options = resolveCompanionMdnsInterfaceOptions(networkInterface) as BonjourOptions | undefined;
    const bonjour = new Bonjour(options);
    const browser = bonjour.find({ protocol: 'tcp', type: 'foliole-sync' }, resolveService);
    return { bonjour, browser };
  });
  const timeout = setTimeout(() => rejectService(new Error(
    `Foliole mDNS service was not discovered on ${interfaces.filter(Boolean).join(', ') || 'the default route'}`
  )), timeoutMs);
  try {
    return await discovered;
  } finally {
    clearTimeout(timeout);
    runtimes.forEach(({ bonjour, browser }) => {
      browser.stop();
      bonjour.destroy();
    });
  }
}
