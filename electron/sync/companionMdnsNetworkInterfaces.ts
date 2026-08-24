import os from 'node:os';

export function resolveCompanionMdnsIpv4Addresses(
  interfaces = os.networkInterfaces()
) {
  return [...new Set(Object.values(interfaces).flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address))];
}

export function resolveCompanionMdnsDiscoveryInterfaces(
  interfaces = os.networkInterfaces()
) {
  return [undefined, ...resolveCompanionMdnsIpv4Addresses(interfaces)];
}
