import { prepareNativeCompanionWorkgroupRequestIfPresent } from './companion/network/signedRequest';
import { createSignedRequestHeaders } from './companionWorkspacePairing';
import {
  FolioleCompanionSync,
  isNativeCompanionPairingRuntime,
  normalizeEndpointUrl
} from './companionWorkspaceRuntimeRepository';

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
  const response = await requestDesktop(`${endpoint}${pathWithQuery}`, {
    headers: await createSignedRequestHeaders({ endpointUrl: endpoint, method: 'GET', pathWithQuery }),
    method: 'GET'
  });
  return await readDesktopJson<T>(response, pathWithQuery, 'source');
}

export async function postDesktopJson<T>(endpointUrl: string, pathWithQuery: string, body: unknown): Promise<T> {
  const endpoint = normalizeEndpointUrl(endpointUrl);
  const bodyText = JSON.stringify(body);
  const prepared = await prepareNativeCompanionWorkgroupRequestIfPresent({
    bodyText, endpointUrl: endpoint, method: 'POST', pathWithQuery
  });
  const response = await requestDesktop(`${endpoint}${pathWithQuery}`, {
    body: prepared?.body ?? bodyText,
    headers: prepared?.headers ?? {
      'Content-Type': 'application/json',
      ...await createSignedRequestHeaders({ bodyText, endpointUrl: endpoint, method: 'POST', pathWithQuery })
    },
    method: 'POST'
  });
  return await readDesktopJson<T>(response, pathWithQuery, 'target');
}

async function requestDesktop(
  url: string,
  init: { body?: string; headers?: Record<string, string>; method: string }
): Promise<Response> {
  if (!isNativeCompanionPairingRuntime()) {
    return await fetch(url, init);
  }
  const payload = await FolioleCompanionSync.desktopHttpRequest({
    ...(init.body !== undefined ? { body: init.body } : {}),
    ...(init.headers !== undefined ? { headers: init.headers } : {}),
    method: init.method,
    url
  });
  return new Response(payload.body, { status: payload.status });
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
