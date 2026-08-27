import { runWithDatabaseConnectionOwner } from '../database/connection.js';

import { createDesktopSyncGroupSignedHeaders } from './desktopSyncGroupSignedHeaders.js';
import {
  decryptDesktopWorkgroupResponse,
  encryptDesktopWorkgroupRequest,
  WORKGROUP_ENVELOPE_CONTENT_TYPE
} from './workgroupHttpCrypto.js';

export { createDesktopSyncGroupSignedHeaders } from './desktopSyncGroupSignedHeaders.js';

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
  method: string;
  pathWithQuery: string;
  response: Response;
}) {
  if (!args.response.ok) throw new Error(`sync_group_http_${args.response.status}`);
  if (args.response.headers.get('content-type') !== WORKGROUP_ENVELOPE_CONTENT_TYPE) {
    throw new Error('workgroup_aead_response_required');
  }
  const body = Buffer.from(await args.response.arrayBuffer());
  return runWithDatabaseConnectionOwner(() => decryptDesktopWorkgroupResponse({
    body, contentType: args.contentType, groupId: args.groupId,
    method: args.method, pathWithQuery: args.pathWithQuery
  }));
}

export async function postDesktopWorkgroupJson(args: {
  body: string;
  endpointUrl: string;
  groupId: string;
  localDeviceId: string;
  pathWithQuery: string;
  secret: string;
}) {
  const encrypted = createDesktopWorkgroupPost(args);
  const response = await fetch(`${args.endpointUrl}${args.pathWithQuery}`, {
    body: encrypted.body, headers: encrypted.headers, method: 'POST'
  });
  const body = await readDesktopWorkgroupResponse({
    contentType: 'application/json; charset=utf-8', groupId: args.groupId,
    method: 'POST', pathWithQuery: args.pathWithQuery, response
  });
  return JSON.parse(body.toString('utf8')) as Record<string, unknown>;
}
