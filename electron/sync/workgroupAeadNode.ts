import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

import type { WorkgroupAeadContext, WorkgroupAeadEnvelope } from '../../lib/core/sync/workgroupAead.js';

const VERSION = 'foliole-workgroup-aead-v1';
const MAX_CLOCK_DRIFT_MS = 60_000;

export function deriveWorkgroupKeyNode(groupKey: string, context: WorkgroupAeadContext) {
  return Buffer.from(hkdfSync('sha256', Buffer.from(groupKey, 'base64url'), Buffer.from(context.groupTag),
    Buffer.from(`Foliole Workgroup AEAD v1\n${context.direction}`), 32));
}

export function encodeWorkgroupAadNode(context: WorkgroupAeadContext, timestampMs: number) {
  return Buffer.from([
    VERSION, context.groupTag, context.method.toUpperCase(), context.pathWithQuery,
    context.direction, context.contentType, String(timestampMs)
  ].join('\n'));
}

export function encryptWorkgroupPayloadNode(args: {
  context: WorkgroupAeadContext;
  groupKey: string;
  nonce?: Buffer;
  plaintext: Buffer;
  timestampMs?: number;
}): WorkgroupAeadEnvelope {
  const nonce = args.nonce ?? randomBytes(12);
  if (nonce.byteLength !== 12) throw new Error('workgroup_aead_nonce_invalid');
  const timestampMs = args.timestampMs ?? Date.now();
  const cipher = createCipheriv('aes-256-gcm', deriveWorkgroupKeyNode(args.groupKey, args.context), nonce);
  cipher.setAAD(encodeWorkgroupAadNode(args.context, timestampMs));
  const ciphertext = Buffer.concat([cipher.update(args.plaintext), cipher.final(), cipher.getAuthTag()]);
  return {
    ciphertext: ciphertext.toString('base64url'), content_type: args.context.contentType,
    nonce: nonce.toString('base64url'), timestamp_ms: timestampMs, version: VERSION
  };
}

export function decryptWorkgroupPayloadNode(args: {
  context: WorkgroupAeadContext;
  envelope: WorkgroupAeadEnvelope;
  groupKey: string;
  nowMs?: number;
}) {
  if (args.envelope.version !== VERSION || args.envelope.content_type !== args.context.contentType) {
    throw new Error('workgroup_aead_envelope_invalid');
  }
  if (Math.abs((args.nowMs ?? Date.now()) - args.envelope.timestamp_ms) > MAX_CLOCK_DRIFT_MS) {
    throw new Error('workgroup_aead_expired');
  }
  try {
    const encrypted = Buffer.from(args.envelope.ciphertext, 'base64url');
    const tagOffset = encrypted.byteLength - 16;
    if (tagOffset < 0) throw new Error('short ciphertext');
    const nonce = Buffer.from(args.envelope.nonce, 'base64url');
    if (nonce.byteLength !== 12) throw new Error('workgroup_aead_nonce_invalid');
    const decipher = createDecipheriv('aes-256-gcm', deriveWorkgroupKeyNode(args.groupKey, args.context),
      nonce, { authTagLength: 16 });
    decipher.setAAD(encodeWorkgroupAadNode(args.context, args.envelope.timestamp_ms));
    decipher.setAuthTag(encrypted.subarray(tagOffset));
    return Buffer.concat([decipher.update(encrypted.subarray(0, tagOffset)), decipher.final()]);
  } catch (error) {
    throw new Error('workgroup_aead_authentication_failed', { cause: error });
  }
}
