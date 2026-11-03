// @vitest-environment node
/* global Request, Response, TextEncoder */
import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import worker, { handleTestflightWebhook, verifyAppleSignature } from './testflight-webhook.mjs';

const SECRET = 'test-only-apple-webhook-secret-at-least-32-characters';
const env = {
  APPLE_WEBHOOK_SECRET: SECRET, GITHUB_DISPATCH_TOKEN: 'test-only-github-token',
  GITHUB_REPOSITORY: 'campfirium/foliole', GITHUB_REF: 'dev',
  GITHUB_WORKFLOW: 'ios-testflight-event.yml'
};
const encoder = new TextEncoder();

function event(type = 'buildUploadStateUpdated', resourceType = 'buildUploads') {
  return { data: {
    type, id: 'apple-event-1', version: 1,
    attributes: { newState: 'COMPLETE', timestamp: '2026-11-03T00:00:00Z' },
    relationships: { instance: { data: { type: resourceType, id: 'apple-resource-1' } } }
  } };
}

function signedRequest(payload = event(), options = {}) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const signature = `hmacsha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`;
  return new Request('https://receiver.example/webhook', {
    method: 'POST', body, headers: { 'x-apple-signature': signature, ...options }
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('authenticated Apple callback to the fixed release continuation', () => {
  it('verifies the original bytes against the Apple documented HMAC vector', async () => {
    const signature = 'hmacsha256=7f062172b01cb00b53ca068614674a3d982a34062a0f5d37687d5e3377e54657';
    const body = encoder.encode('Hello, World!');
    const expected = `hmacsha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`;
    expect(await verifyAppleSignature(body, expected, SECRET)).toBe(true);
    expect(await verifyAppleSignature(encoder.encode('Hello, World?'), expected, SECRET)).toBe(false);
    expect(await verifyAppleSignature(body, signature, 'This is my secret')).toBe(true);
  });

  it.each([
    ['buildUploadStateUpdated', 'buildUploads'],
    ['buildBetaDetailExternalBuildStateUpdated', 'buildBetaDetails']
  ])('dispatches %s only as a resource signal, without trusting payload commands', async (type, resourceType) => {
    const payload = event(type, resourceType);
    payload.data.ref = 'attacker';
    payload.data.attributes.command = 'publish';
    const fetchImpl = vi.fn(async () => new Response('', { status: 200 }));
    const response = await handleTestflightWebhook(signedRequest(payload), env, fetchImpl);
    expect(response.status).toBe(202);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/campfirium/foliole/actions/workflows/ios-testflight-event.yml/dispatches');
    expect(JSON.parse(options.body)).toEqual({ ref: 'dev', inputs: {
      event_id: 'apple-event-1', resource_type: resourceType, resource_id: 'apple-resource-1'
    } });
    expect(options.headers.authorization).toBe('Bearer test-only-github-token');
    expect(options.redirect).toBe('error');
  });

  it('handles the real Worker fetch signature, whose third argument is an execution context', async () => {
    const outbound = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', outbound);
    expect((await worker.fetch(signedRequest(), env, { waitUntil: vi.fn() })).status).toBe(202);
    expect(outbound).toHaveBeenCalledOnce();
  });

  it.each(['', 'hmacsha256=bad', `hmacsha256=${'0'.repeat(64)}`])('rejects an absent or invalid signature', async (signature) => {
    const outbound = vi.fn();
    const response = await handleTestflightWebhook(signedRequest(event(), { 'x-apple-signature': signature }), env, outbound);
    expect(response.status).toBe(401);
    expect(outbound).not.toHaveBeenCalled();
  });

  it.each(['{', { data: {} }, event('buildUploadStateUpdated', 'apps')])('rejects malformed authenticated payloads', async (payload) => {
    const outbound = vi.fn();
    expect((await handleTestflightWebhook(signedRequest(payload), env, outbound)).status).toBe(400);
    expect(outbound).not.toHaveBeenCalled();
  });

  it('acknowledges signed unrelated events without triggering a release', async () => {
    const outbound = vi.fn();
    expect((await handleTestflightWebhook(signedRequest(event('betaFeedbackCreated')), env, outbound)).status).toBe(200);
    expect(outbound).not.toHaveBeenCalled();
    expect((await handleTestflightWebhook(signedRequest({ data: { type: 'ping' } }), env, outbound)).status).toBe(200);
  });

  it.each([new Response('do not expose upstream details', { status: 403 }), new Error('secret upstream detail')])(
    'does not report delivery success when GitHub rejects or fails', async (result) => {
      const outbound = vi.fn(async () => { if (result instanceof Error) throw result; return result; });
      const response = await handleTestflightWebhook(signedRequest(), env, outbound);
      expect(response.status).toBe(502);
      expect(await response.text()).not.toMatch(/secret|token|upstream details/u);
    }
  );

  it('fails closed when configuration is missing and rejects oversized bodies', async () => {
    const outbound = vi.fn();
    expect((await handleTestflightWebhook(signedRequest(), {}, outbound)).status).toBe(503);
    expect((await handleTestflightWebhook(signedRequest('x'.repeat(65537)), env, outbound)).status).toBe(413);
    expect(outbound).not.toHaveBeenCalled();
  });

  it('does not accept a known resource type with a missing resource ID', async () => {
    const payload = event();
    delete payload.data.relationships.instance.data.id;
    expect((await handleTestflightWebhook(signedRequest(payload), env, vi.fn())).status).toBe(400);
  });
});
