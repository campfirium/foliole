import type { RemoteImageDiagnosticEvent } from './remoteImageDiagnostics.js';

export type RemoteImageFetchTransport = (sourceUrl: string, init: RequestInit) => Promise<Response>;

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

export function resolveRemoteImageTransportName(
  fetchTransportForTests: RemoteImageFetchTransport | null
): RemoteImageDiagnosticEvent['transport'] {
  return fetchTransportForTests ? 'test' : process.versions.electron ? 'electron.net.fetch' : 'global.fetch';
}
