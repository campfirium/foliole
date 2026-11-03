/* global AbortSignal, crypto, fetch, Response, TextDecoder, TextEncoder, URL */
const MAX_BODY_BYTES = 64 * 1024;
const RESOURCE_TYPES = new Map([
  ['buildUploadStateUpdated', 'buildUploads'],
  ['buildBetaDetailExternalBuildStateUpdated', 'buildBetaDetails']
]);
const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const encoder = new TextEncoder();

function reply(status, state) {
  return Response.json({ state }, { status, headers: { 'cache-control': 'no-store' } });
}

async function readBoundedBody(request) {
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) return null;
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function verifyAppleSignature(body, header, secret) {
  if (typeof secret !== 'string' || !secret) return false;
  const match = /^hmacsha256=([a-f0-9]{64})$/iu.exec(header ?? '');
  if (!match) return false;
  const signature = Uint8Array.from(match[1].match(/../gu), (byte) => parseInt(byte, 16));
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, signature, body);
}

export function parseAppleEvent(body) {
  const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body))?.data;
  if (typeof data?.type !== 'string' || !data.type) throw new Error('invalid_event');
  const resourceType = RESOURCE_TYPES.get(data.type);
  if (!resourceType) return null;
  if (typeof data.id !== 'string' || !ID.test(data.id) || data.version !== 1) {
    throw new Error('invalid_event');
  }
  const instance = data.relationships?.instance?.data;
  if (instance?.type !== resourceType || typeof instance.id !== 'string' || !ID.test(instance.id)) {
    throw new Error('invalid_resource');
  }
  // Treat the callback only as a signal; the consumer re-reads Apple's current state.
  return { event_id: data.id, resource_type: resourceType, resource_id: instance.id };
}

function dispatchSettings(env) {
  if (!env.GITHUB_DISPATCH_TOKEN || typeof env.APPLE_WEBHOOK_SECRET !== 'string' ||
      env.APPLE_WEBHOOK_SECRET.length < 32) return null;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(env.GITHUB_REPOSITORY ?? '')) return null;
  if (!/^[A-Za-z0-9_-]+\.yml$/u.test(env.GITHUB_WORKFLOW ?? '')) return null;
  if (!/^[A-Za-z0-9_-]+$/u.test(env.GITHUB_REF ?? '')) return null;
  return `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/${env.GITHUB_WORKFLOW}/dispatches`;
}

async function dispatchEvent(url, event, env, fetchImpl) {
  const response = await fetchImpl(url, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: {
      authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
      accept: 'application/vnd.github+json', 'content-type': 'application/json',
      'user-agent': 'Foliole-TestFlight-Webhook', 'x-github-api-version': '2026-03-10'
    },
    body: JSON.stringify({ ref: env.GITHUB_REF, inputs: event })
  });
  // Acknowledge Apple only after GitHub has accepted the continuation.
  return response.ok ? reply(202, 'dispatched') : reply(502, 'dispatch_failed');
}

export async function handleTestflightWebhook(request, env, fetchImpl = fetch) {
  const { pathname } = new URL(request.url);
  if (pathname === '/health' && request.method === 'GET') {
    return reply(200, 'receiver_alive');
  }
  if (pathname !== '/webhook') return reply(404, 'not_found');
  if (request.method !== 'POST') return reply(405, 'method_not_allowed');
  const url = dispatchSettings(env);
  if (!url) return reply(503, 'receiver_not_configured');
  try {
    const body = await readBoundedBody(request);
    if (!body) return reply(413, 'payload_too_large');
    if (!await verifyAppleSignature(body, request.headers.get('x-apple-signature'), env.APPLE_WEBHOOK_SECRET)) {
      return reply(401, 'invalid_signature');
    }
    let event;
    try { event = parseAppleEvent(body); }
    catch { return reply(400, 'invalid_event'); }
    if (!event) return reply(200, 'event_ignored');
    return await dispatchEvent(url, event, env, fetchImpl);
  } catch {
    return reply(502, 'delivery_failed');
  }
}

export default {
  fetch(request, env) { return handleTestflightWebhook(request, env); }
};
