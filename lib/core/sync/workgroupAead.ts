const VERSION = 'foliole-workgroup-aead-v1';
const INFO_PREFIX = 'Foliole Workgroup AEAD v1';
const MAX_CLOCK_DRIFT_MS = 60_000;

export interface WorkgroupAeadEnvelope {
  ciphertext: string;
  content_type: string;
  nonce: string;
  timestamp_ms: number;
  version: typeof VERSION;
}

export interface WorkgroupAeadContext {
  contentType: string;
  direction: 'request' | 'response';
  groupTag: string;
  method: string;
  pathWithQuery: string;
}

function bytes(value: string) {
  return new TextEncoder().encode(value);
}

function arrayBuffer(value: Uint8Array) {
  return Uint8Array.from(value).buffer;
}

function base64Url(value: Uint8Array) {
  let binary = '';
  for (const item of value) binary += String.fromCharCode(item);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function fromBase64Url(value: string) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function hex(value: Uint8Array) {
  return [...value].map((item) => item.toString(16).padStart(2, '0')).join('');
}

export async function deriveWorkgroupTag(groupKey: string) {
  const digest = await crypto.subtle.digest('SHA-256', fromBase64Url(groupKey));
  return hex(new Uint8Array(digest).slice(0, 16));
}

async function deriveKey(groupKey: string, context: WorkgroupAeadContext) {
  const material = await crypto.subtle.importKey('raw', fromBase64Url(groupKey), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({
    hash: 'SHA-256', info: bytes(`${INFO_PREFIX}\n${context.direction}`),
    name: 'HKDF', salt: bytes(context.groupTag)
  }, material, { length: 256, name: 'AES-GCM' }, false, ['decrypt', 'encrypt']);
}

function aad(context: WorkgroupAeadContext, timestampMs: number) {
  return bytes([
    VERSION, context.groupTag, context.method.toUpperCase(), context.pathWithQuery,
    context.direction, context.contentType, String(timestampMs)
  ].join('\n'));
}

export async function encryptWorkgroupPayload(args: {
  context: WorkgroupAeadContext;
  groupKey: string;
  nonce?: Uint8Array;
  plaintext: Uint8Array;
  timestampMs?: number;
}): Promise<WorkgroupAeadEnvelope> {
  const nonce = args.nonce ?? crypto.getRandomValues(new Uint8Array(12));
  if (nonce.byteLength !== 12) throw new Error('workgroup_aead_nonce_invalid');
  const timestampMs = args.timestampMs ?? Date.now();
  const ciphertext = await crypto.subtle.encrypt({
    additionalData: arrayBuffer(aad(args.context, timestampMs)), iv: arrayBuffer(nonce),
    name: 'AES-GCM', tagLength: 128
  }, await deriveKey(args.groupKey, args.context), arrayBuffer(args.plaintext));
  return {
    ciphertext: base64Url(new Uint8Array(ciphertext)), content_type: args.context.contentType,
    nonce: base64Url(nonce), timestamp_ms: timestampMs, version: VERSION
  };
}

export async function decryptWorkgroupPayload(args: {
  context: WorkgroupAeadContext;
  envelope: WorkgroupAeadEnvelope;
  groupKey: string;
  nowMs?: number;
}) {
  if (args.envelope.version !== VERSION || args.envelope.content_type !== args.context.contentType) {
    throw new Error('workgroup_aead_envelope_invalid');
  }
  const nowMs = args.nowMs ?? Date.now();
  if (Math.abs(nowMs - args.envelope.timestamp_ms) > MAX_CLOCK_DRIFT_MS) {
    throw new Error('workgroup_aead_expired');
  }
  const nonce = fromBase64Url(args.envelope.nonce);
  if (nonce.byteLength !== 12) throw new Error('workgroup_aead_nonce_invalid');
  try {
    const plaintext = await crypto.subtle.decrypt({
      additionalData: arrayBuffer(aad(args.context, args.envelope.timestamp_ms)), iv: arrayBuffer(nonce),
      name: 'AES-GCM', tagLength: 128
    }, await deriveKey(args.groupKey, args.context), arrayBuffer(fromBase64Url(args.envelope.ciphertext)));
    return new Uint8Array(plaintext);
  } catch (error) {
    throw new Error('workgroup_aead_authentication_failed', { cause: error });
  }
}

export function workgroupAeadNonceIdentity(envelope: WorkgroupAeadEnvelope) {
  return `${envelope.timestamp_ms}:${envelope.nonce}`;
}
