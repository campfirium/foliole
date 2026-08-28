import type { DesktopDnsSdService } from '@foliole/desktop-dnssd';

type DiagnosticDetails = Record<string, boolean | number | string | string[] | null>;

export function desktopDnsSdServiceFacts(service: DesktopDnsSdService) {
  return {
    addresses: [...service.addresses].sort(),
    fqdn: service.fqdn,
    interfaceIndex: service.interfaceIndex,
    name: service.name,
    port: service.port,
    txtKeys: Object.keys(service.txt).sort()
  };
}

export function logDesktopDnsSdDiagnostic(event: string, details: DiagnosticDetails = {}) {
  console.info('[desktop-dnssd]', JSON.stringify({ event, ...details }));
}
