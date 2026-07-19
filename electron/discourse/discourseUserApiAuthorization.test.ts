// @vitest-environment node

import { constants, publicEncrypt } from 'node:crypto';

import { afterEach, expect, it, vi } from 'vitest';

import {
  beginDiscourseUserApiAuthorization,
  completeDiscourseUserApiAuthorization,
  resetDiscourseUserApiAuthorizationForTests
} from './discourseUserApiAuthorization.js';

afterEach(() => {
  resetDiscourseUserApiAuthorizationForTests();
  vi.useRealTimers();
});

function encryptAuthorizationPayload(url: URL, payload: Record<string, unknown>) {
  return publicEncrypt({
    key: url.searchParams.get('public_key') ?? '',
    oaepHash: 'sha1',
    padding: constants.RSA_PKCS1_OAEP_PADDING
  }, Buffer.from(JSON.stringify(payload))).toString('base64');
}

it('generates a scoped Discourse authorization link and decrypts its verified result', async () => {
  const result = await beginDiscourseUserApiAuthorization('https://forum.example.com/');
  const url = new URL(result.authorization_url);
  expect(result.authorization_url.length).toBeLessThan(2081);
  expect(url.origin + url.pathname).toBe('https://forum.example.com/user-api-key/new');
  expect(url.searchParams.get('application_name')).toBe('Foliole');
  expect(url.searchParams.get('client_id')).toMatch(/^[a-f0-9]{32}$/u);
  expect(url.searchParams.get('scopes')).toBe('read,write');
  expect(url.searchParams.get('padding')).toBe('oaep');

  const encrypted = encryptAuthorizationPayload(url, {
    key: 'SENTINEL-USER-API-KEY',
    nonce: url.searchParams.get('nonce')
  });
  expect(completeDiscourseUserApiAuthorization('https://forum.example.com', encrypted))
    .toBe('SENTINEL-USER-API-KEY');
});

it('rejects a result with a mismatched nonce without exposing the key', async () => {
  const url = new URL((await beginDiscourseUserApiAuthorization('https://forum.example.com')).authorization_url);
  const encrypted = encryptAuthorizationPayload(url, {
    key: 'SENTINEL-USER-API-KEY',
    nonce: 'wrong-nonce'
  });
  expect(() => completeDiscourseUserApiAuthorization('https://forum.example.com', encrypted))
    .toThrow('Discourse authorization could not be verified.');
});

it('rejects unsafe forum URLs and expired authorization sessions', async () => {
  await expect(beginDiscourseUserApiAuthorization('http://forum.example.com')).rejects
    .toThrow('requires an HTTPS forum URL');
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-19T00:00:00.000Z'));
  const result = await beginDiscourseUserApiAuthorization('https://forum.example.com');
  vi.setSystemTime(new Date('2026-07-19T00:16:00.000Z'));
  expect(() => completeDiscourseUserApiAuthorization('https://forum.example.com', result.authorization_url))
    .toThrow('authorization has expired');
});

it('keeps a forum subpath in the authorization endpoint', async () => {
  const result = await beginDiscourseUserApiAuthorization('https://example.com/community');
  expect(new URL(result.authorization_url).pathname).toBe('/community/user-api-key/new');
});

it('does not accept an authorization result for a different forum', async () => {
  const result = await beginDiscourseUserApiAuthorization('https://forum.example.com');
  expect(() => completeDiscourseUserApiAuthorization('https://other.example.com', result.authorization_url))
    .toThrow('Generate a new Discourse authorization link first.');
});
