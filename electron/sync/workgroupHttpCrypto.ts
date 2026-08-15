import { createCipheriv, randomBytes } from 'node:crypto';
import type http from 'node:http';

import type { WorkgroupAeadEnvelope } from '../../lib/core/sync/workgroupAead.js';

import {
  decryptWorkgroupPayloadNode, deriveWorkgroupKeyNode, encodeWorkgroupAadNode, encryptWorkgroupPayloadNode
} from './workgroupAeadNode.js';
import { consumeDesktopWorkgroupNonce, loadDesktopWorkgroupKey } from './workgroupKeyStore.js';

export const WORKGROUP_ENVELOPE_CONTENT_TYPE = 'application/vnd.foliole.workgroup-aead+json';

function header(request: http.IncomingMessage, key: string) {
  const value = request.headers[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function context(request: http.IncomingMessage, direction: 'request' | 'response', contentType: string, groupTag: string) {
  return {
    contentType, direction, groupTag, method: request.method ?? 'GET', pathWithQuery: request.url ?? '/'
  };
}

function credentials(request: http.IncomingMessage) {
  const groupId = header(request, 'x-sync-group-id');
  const stored = groupId ? loadDesktopWorkgroupKey(groupId) : null;
  if (!stored) throw new Error('sync_group_workgroup_key_missing');
  return stored;
}

export function decryptWorkgroupRequestBody(request: http.IncomingMessage, envelopeText: string) {
  const envelope = JSON.parse(envelopeText) as WorkgroupAeadEnvelope;
  const stored = credentials(request);
  return decryptWorkgroupPayloadNode({
    context: context(request, 'request', envelope.content_type, stored.group_tag), envelope,
    groupKey: stored.group_key
  });
}

export function encryptWorkgroupResponse(
  request: http.IncomingMessage, body: Buffer, contentType: string
) {
  const stored = credentials(request);
  return Buffer.from(JSON.stringify(encryptWorkgroupPayloadNode({
    context: context(request, 'response', contentType, stored.group_tag), groupKey: stored.group_key, plaintext: body
  })));
}

export function createWorkgroupResponseStreamCipher(
  request: http.IncomingMessage, contentType: string
) {
  const stored = credentials(request);
  const timestampMs = Date.now();
  const nonce = randomBytes(12);
  const streamContext = context(request, 'response', contentType, stored.group_tag);
  const cipher = createCipheriv('aes-256-gcm', deriveWorkgroupKeyNode(stored.group_key, streamContext), nonce);
  cipher.setAAD(encodeWorkgroupAadNode(streamContext, timestampMs));
  const prefix = JSON.stringify({
    version: 'foliole-workgroup-aead-v1', timestamp_ms: timestampMs,
    nonce: nonce.toString('base64url'), content_type: contentType
  }).replace(/\}\s*$/u, ',"ciphertext":"');
  return { authTag: () => cipher.getAuthTag(), cipher, prefix: Buffer.from(prefix), suffix: Buffer.from('"}') };
}

export function decryptDesktopWorkgroupResponse(args: {
  body: Buffer;
  contentType: string;
  groupId: string;
  method: string;
  pathWithQuery: string;
}) {
  const stored = loadDesktopWorkgroupKey(args.groupId);
  if (!stored) throw new Error('sync_group_workgroup_key_missing');
  const envelope = JSON.parse(args.body.toString('utf8')) as WorkgroupAeadEnvelope;
  const nonceId = `${envelope.timestamp_ms}:${envelope.nonce}`;
  const plaintext = decryptWorkgroupPayloadNode({
    context: {
      contentType: args.contentType, direction: 'response', groupTag: stored.group_tag,
      method: args.method, pathWithQuery: args.pathWithQuery
    }, envelope, groupKey: stored.group_key
  });
  if (!consumeDesktopWorkgroupNonce(args.groupId, `response:${nonceId}`)) {
    throw new Error('workgroup_aead_replayed');
  }
  return plaintext;
}

export function encryptDesktopWorkgroupRequest(args: {
  body: Buffer;
  contentType: string;
  groupId: string;
  method: string;
  pathWithQuery: string;
}) {
  const stored = loadDesktopWorkgroupKey(args.groupId);
  if (!stored) throw new Error('sync_group_workgroup_key_missing');
  return JSON.stringify(encryptWorkgroupPayloadNode({
    context: {
      contentType: args.contentType, direction: 'request', groupTag: stored.group_tag,
      method: args.method, pathWithQuery: args.pathWithQuery
    }, groupKey: stored.group_key, plaintext: args.body
  }));
}
