import { createSignedRequestHeaders } from './companionWorkspacePairing';
import { normalizeEndpointUrl } from './companionWorkspaceSyncBridge';

export class DesktopSyncHttpError extends Error {
  body: string;
  path: string;
  status: number;

  constructor(message: string, args: { body: string; path: string; status: number }) {
    super(message);
    this.name = 'DesktopSyncHttpError';
    this.body = args.body;
    this.path = args.path;
    this.status = args.status;
  }
}

export async function fetchDesktopJson<T>(endpointUrl: string, pathWithQuery: string): Promise<T> {
  const endpoint = normalizeEndpointUrl(endpointUrl);
  const response = await fetch(`${endpoint}${pathWithQuery}`, {
    headers: await createSignedRequestHeaders({ method: 'GET', pathWithQuery })
  });
  return await readDesktopJson<T>(response, pathWithQuery, 'source');
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
  return await readDesktopJson<T>(response, pathWithQuery, 'target');
}

async function readDesktopJson<T>(
  response: Response,
  pathWithQuery: string,
  role: 'source' | 'target'
): Promise<T> {
  if (!response.ok) {
    const body = await response.text();
    throw new DesktopSyncHttpError(
      `Desktop sync ${role} returned ${response.status} for ${pathWithQuery}.`,
      { body, path: pathWithQuery, status: response.status }
    );
  }
  return await response.json() as T;
}
