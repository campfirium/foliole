import { runWithDatabaseConnectionOwner } from '../database/connection.js';

import { createDesktopSyncGroupSignedHeaders } from './desktopSyncGroupSignedHeaders.js';
import { isWorkgroupConnectionReset } from './workgroupConnectionReset.js';
import {
  decryptDesktopWorkgroupResponse,
  encryptDesktopWorkgroupRequest,
  WORKGROUP_ENVELOPE_CONTENT_TYPE
} from './workgroupHttpCrypto.js';

export { createDesktopSyncGroupSignedHeaders } from './desktopSyncGroupSignedHeaders.js';

export async function fetchDesktopWorkgroupJson<T>(args: {
  endpointUrl: string;
  groupId: string;
  localDeviceId: string;
  pathWithQuery: string;
  secret: string;
}): Promise<T> {
  try { return await fetchDesktopWorkgroupJsonOnce<T>(args); }
  catch (error) {
    if (!isWorkgroupConnectionReset(error)) throw error;
    return fetchDesktopWorkgroupJsonOnce<T>(args);
  }
}

async function fetchDesktopWorkgroupJsonOnce<T>(args: {
  endpointUrl: string;
  groupId: string;
  localDeviceId: string;
  pathWithQuery: string;
  secret: string;
}): Promise<T> {
  const response = await fetch(`${args.endpointUrl}${args.pathWithQuery}`, {
    headers: createDesktopSyncGroupSignedHeaders({
      ...args, method: 'GET'
    })
  });
  const body = await readDesktopWorkgroupResponse({
    contentType: 'application/json; charset=utf-8', groupId: args.groupId,
    maxEnvelopeBytes: 512 * 1024, method: 'GET',
    pathWithQuery: args.pathWithQuery, response
  });
  return JSON.parse(body.toString('utf8')) as T;
}

export async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : `http_${response.status}`);
  return payload;
}

export function createDesktopWorkgroupPost(args: {
  body: string;
  groupId: string;
  localDeviceId: string;
  pathWithQuery: string;
  secret: string;
}) {
  const body = encryptDesktopWorkgroupRequest({
    body: Buffer.from(args.body), contentType: 'application/json; charset=utf-8', groupId: args.groupId,
    method: 'POST', pathWithQuery: args.pathWithQuery
  });
  return {
    body,
    headers: {
      ...createDesktopSyncGroupSignedHeaders({ ...args, body, method: 'POST' }),
      'Content-Type': WORKGROUP_ENVELOPE_CONTENT_TYPE
    }
  };
}

export async function readDesktopWorkgroupResponse(args: {
  contentType: string;
  groupId: string;
  maxEnvelopeBytes?: number;
  method: string;
  pathWithQuery: string;
  response: Response;
}) {
  if (args.response.headers.get('content-type') !== WORKGROUP_ENVELOPE_CONTENT_TYPE) {
    throw new Error('workgroup_aead_response_required');
  }
  const body = args.maxEnvelopeBytes === undefined
    ? Buffer.from(await args.response.arrayBuffer())
    : await readBoundedResponse(args.response, args.maxEnvelopeBytes);
  const contentType = args.response.headers.get('x-foliole-original-content-type') ?? args.contentType;
  const plaintext = await runWithDatabaseConnectionOwner(() => decryptDesktopWorkgroupResponse({
    body, contentType, groupId: args.groupId,
    method: args.method, pathWithQuery: args.pathWithQuery
  }));
  if (!args.response.ok) {
    const error = readWorkgroupError(plaintext);
    throw new Error(`sync_group_http_${args.response.status}${error ? `:${error}` : ''}`);
  }
  return plaintext;
}

async function readBoundedResponse(response: Response, limit: number) {
  if (!Number.isSafeInteger(limit) || limit < 1 || !response.body) {
    throw new Error('workgroup_aead_response_limit_invalid');
  }
  const chunks: Buffer[] = [];
  const reader = response.body.getReader();
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) throw new Error('workgroup_aead_response_limit_exceeded');
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    try { await reader.cancel(); } catch { /* Preserve the transfer error. */ }
    throw error;
  }
  return Buffer.concat(chunks, total);
}

function readWorkgroupError(body: Buffer) {
  try {
    const value = JSON.parse(body.toString('utf8')) as { error?: unknown };
    return typeof value.error === 'string' && value.error.trim() ? value.error.trim() : null;
  } catch {
    return null;
  }
}

export async function postDesktopWorkgroupJson(args: {
  body: string;
  endpointUrl: string;
  groupId: string;
  localDeviceId: string;
  pathWithQuery: string;
  secret: string;
}) {
  const encrypted = await runWithDatabaseConnectionOwner(() => createDesktopWorkgroupPost(args));
  const response = await fetch(`${args.endpointUrl}${args.pathWithQuery}`, {
    body: encrypted.body, headers: encrypted.headers, method: 'POST'
  });
  const body = await readDesktopWorkgroupResponse({
    contentType: 'application/json; charset=utf-8', groupId: args.groupId,
    method: 'POST', pathWithQuery: args.pathWithQuery, response
  });
  return JSON.parse(body.toString('utf8')) as Record<string, unknown>;
}
