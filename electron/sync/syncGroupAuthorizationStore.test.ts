// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import type { SyncGroupSecureRouteMetadata } from '../../lib/platform/syncGroupAuthorizationContract.js';

import {
  SyncGroupAuthorizationStore,
  type SyncGroupAuthorizationStoreCrypto
} from './syncGroupAuthorizationStore.js';

const request = {
  body_hash: 'body-hash', method: 'POST', nonce: 'nonce-a',
  path_with_query: '/companion/sync?cursor=3', timestamp: '2026-08-26T00:00:00.000Z'
};
const secret = Buffer.from('route-secret', 'utf8').toString('base64url');

it('persists encrypted routes, rejects replay, and removes signing ability on revoke', () => {
  const root = path.resolve('.tmp/artifacts/sync-group-authorization/store-test');
  fs.mkdirSync(root, { recursive: true });
  const memberPath = path.join(root, 'member.bin');
  const verificationPath = path.join(root, 'verification.bin');
  fs.rmSync(memberPath, { force: true });
  fs.rmSync(verificationPath, { force: true });
  const crypto = testCrypto();
  const member = new SyncGroupAuthorizationStore(memberPath, crypto);
  const verification = new SyncGroupAuthorizationStore(verificationPath, crypto);
  member.save(route('member'), secret);
  verification.save(route('verification'), secret);

  const restartedMember = new SyncGroupAuthorizationStore(memberPath, crypto);
  const restartedVerification = new SyncGroupAuthorizationStore(verificationPath, crypto);
  const headers = restartedMember.sign('route-a', request);
  expect(restartedMember.load('route-a', 'member')).toEqual(route('member'));
  expect(fs.readFileSync(memberPath).includes(Buffer.from(secret))).toBe(false);
  expect(restartedVerification.verify('route-a', request, headers['X-Signature'], Date.parse(request.timestamp)))
    .toEqual(route('verification'));
  expect(() => restartedVerification.verify(
    'route-a', request, headers['X-Signature'], Date.parse(request.timestamp)
  )).toThrow('replayed_nonce');

  expect(restartedMember.revoke('route-a', 'member')).toBe(true);
  expect(() => restartedMember.sign('route-a', request)).toThrow('sync_group_route_not_active');
});

function route(kind: SyncGroupSecureRouteMetadata['kind']): SyncGroupSecureRouteMetadata {
  return {
    authorization_epoch: 3, authorization_id: 'authorization-member-a',
    endpoint_hint: 'http://127.0.0.1:38641', group_id: 'group-a', kind,
    local_member_id: 'member-a', peer_member_id: 'member-manager', protocol_version: 4,
    route_id: 'route-a', state: 'active'
  };
}

function testCrypto(): SyncGroupAuthorizationStoreCrypto {
  return {
    assertAvailable() {},
    decrypt(value) { return Buffer.from(value.toString('utf8').slice('test-encrypted:'.length), 'base64').toString(); },
    encrypt(value) { return Buffer.from(`test-encrypted:${Buffer.from(value).toString('base64')}`); }
  };
}
