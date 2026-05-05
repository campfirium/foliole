import { createSignedRequestHeaders } from './companionWorkspacePairing';
import { normalizeEndpointUrl } from './companionWorkspaceSyncBridge';

export async function fetchDesktopJson<T>(endpointUrl: string, pathWithQuery: string): Promise<T> {
  const endpoint = normalizeEndpointUrl(endpointUrl);
  const response = await fetch(`${endpoint}${pathWithQuery}`, {
    headers: await createSignedRequestHeaders({ method: 'GET', pathWithQuery })
  });
  if (!response.ok) {
    throw new Error(`Desktop sync source returned ${response.status}.`);
  }
  return await response.json() as T;
}

export async function postDesktopJson<T>(endpointUrl: string, pathWithQuery: string, body: unknown): Promise<T> {
  const endpoint = normalizeEndpointUrl(endpointUrl);
  const bodyText = JSON.stringify(body);
  const response = await fetch(`${endpoint}${pathWithQuery}`, {
    body: bodyText,
    headers: {
      'Content-Type': 'application/json',
      ...await createSignedRequestHeaders({ bodyText, method: 'POST', pathWithQuery })
    },
    method: 'POST'
  });
  if (!response.ok) {
    throw new Error(`Desktop sync target returned ${response.status}.`);
  }
  return await response.json() as T;
}
