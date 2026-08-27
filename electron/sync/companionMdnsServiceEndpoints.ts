type CompanionMdnsService = {
  addresses?: string[];
  port?: number;
  referer?: { address?: string };
  txt?: Record<string, unknown>;
};

const IPV4_ADDRESS = /^\d+\.\d+\.\d+\.\d+$/u;

export function resolveCompanionMdnsServiceEndpoints(service: CompanionMdnsService) {
  if (!service.port) return [];
  const advertised = typeof service.txt?.ipv4_addresses === 'string'
    ? service.txt.ipv4_addresses.split(',') : [];
  const hosts = [service.referer?.address, ...(service.addresses ?? []), ...advertised]
    .filter((value): value is string => typeof value === 'string' && IPV4_ADDRESS.test(value));
  return [...new Set(hosts)].map((host) => `http://${host}:${service.port}`);
}
