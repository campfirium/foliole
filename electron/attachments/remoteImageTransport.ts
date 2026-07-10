import dns from 'node:dns/promises';

import type { RemoteImageDiagnosticEvent } from './remoteImageDiagnostics.js';

export type RemoteImageFetchTransport = (sourceUrl: string, init: RequestInit) => Promise<Response>;
export type RemoteImageHostResolver = (hostname: string) => Promise<string[]>;

function parseResolvedHostAddresses(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      if (typeof entry === 'string') return [entry];
      if (entry && typeof entry === 'object' && typeof (entry as { address?: unknown }).address === 'string') {
        return [(entry as { address: string }).address];
      }
      return [];
    });
  }
  if (value && typeof value === 'object') {
    const addresses = (value as { addresses?: unknown }).addresses;
    if (Array.isArray(addresses)) return addresses.filter((address): address is string => typeof address === 'string');
  }
  return [];
}

async function resolveElectronNetFetch(): Promise<RemoteImageFetchTransport | null> {
  if (!process.versions.electron) return null;
  try {
    const electronModule = await import('electron');
    const netFetch = (electronModule as { net?: { fetch?: RemoteImageFetchTransport } }).net?.fetch;
    return typeof netFetch === 'function' ? netFetch.bind(electronModule.net) : null;
  } catch {
    return null;
  }
}

export async function fetchRemoteImageWithRuntimeTransport(sourceUrl: string, init: RequestInit) {
  const electronNetFetch = await resolveElectronNetFetch();
  return electronNetFetch ? electronNetFetch(sourceUrl, init) : fetch(sourceUrl, init);
}

export async function resolveRemoteImageHostWithRuntimeResolver(hostname: string) {
  if (process.versions.electron) {
    try {
      const electronModule = await import('electron');
      const resolveHost = (electronModule as {
        net?: { resolveHost?: (target: string) => Promise<unknown> };
      }).net?.resolveHost;
      if (typeof resolveHost === 'function') {
        return parseResolvedHostAddresses(await resolveHost(hostname));
      }
    } catch {
      return [];
    }
  }
  return (await dns.lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);
}

export function resolveRemoteImageTransportName(
  fetchTransportForTests: RemoteImageFetchTransport | null
): RemoteImageDiagnosticEvent['transport'] {
  return fetchTransportForTests ? 'test' : process.versions.electron ? 'electron.net.fetch' : 'global.fetch';
}
