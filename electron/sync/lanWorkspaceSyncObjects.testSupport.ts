import crypto from 'node:crypto';
import type http from 'node:http';

import {
  requestWorkspaceSyncServer, type TestHttpResponse, type TestPairedDevice
} from './lanWorkspaceSyncServer.testSupport.js';
import { decryptWorkgroupPayloadNode, encryptWorkgroupPayloadNode } from './workgroupAeadNode.js';

const ENVELOPE_CONTENT_TYPE = 'application/vnd.foliole.workgroup-aead+json';

export function signRequest(args: {
  bodyText?: string;
  authorizationId: string;
  groupId?: string;
  method: string;
  pathWithQuery: string;
  secret: string;
}) {
  const timestamp = new Date().toISOString();
  const nonce = crypto.randomUUID();
  const bodyHash = crypto.createHash('sha256').update(args.bodyText ?? '').digest('hex');
  const canonical = [args.method, args.pathWithQuery, timestamp, nonce, bodyHash].join('\n');
  return {
    'X-Authorization-Id': args.authorizationId,
    'X-Nonce': nonce,
    'X-Signature': crypto.createHmac('sha256', args.secret).update(canonical).digest('hex'),
    ...(args.groupId ? { 'X-Sync-Group-Id': args.groupId } : {}),
    'X-Timestamp': timestamp
  };
}

export async function postSigned(
  server: http.Server,
  pathWithQuery: string,
  bodyText: string,
  paired: TestPairedDevice
) {
  const encryptedBody = paired.group_id && paired.group_tag ? JSON.stringify(encryptWorkgroupPayloadNode({
    context: { contentType: 'application/json; charset=utf-8', direction: 'request',
      groupTag: paired.group_tag, method: 'POST', pathWithQuery },
    groupKey: paired.device_secret, plaintext: Buffer.from(bodyText)
  })) : bodyText;
  const response = await requestWorkspaceSyncServer(server, {
    bodyText: encryptedBody,
    headers: {
      'Content-Type': paired.group_id ? ENVELOPE_CONTENT_TYPE : 'application/json',
      ...signRequest({ authorizationId: paired.authorization_id, bodyText: encryptedBody,
        ...(paired.group_id ? { groupId: paired.group_id } : {}),
        method: 'POST', pathWithQuery, secret: paired.device_secret })
    },
    method: 'POST',
    path: pathWithQuery
  });
  return readWorkgroupResponse(response, 'POST', pathWithQuery, paired);
}

export function readWorkgroupResponse(
  response: TestHttpResponse, method: string, pathWithQuery: string, paired: TestPairedDevice
) {
  if (!paired.group_tag || response.headers['Content-Type'] !== ENVELOPE_CONTENT_TYPE) return response;
  const contentType = String(response.headers['X-Foliole-Original-Content-Type']);
  const body = decryptWorkgroupPayloadNode({
    context: { contentType, direction: 'response', groupTag: paired.group_tag, method, pathWithQuery },
    envelope: JSON.parse(response.body.toString('utf8')), groupKey: paired.device_secret
  });
  return { ...response, body, json: <T>() => JSON.parse(body.toString('utf8')) as T };
}
