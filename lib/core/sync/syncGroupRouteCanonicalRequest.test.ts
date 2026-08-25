import { createHmac } from 'node:crypto';

import { expect, it } from 'vitest';

import type { SyncGroupSecureRouteMetadata } from '../../platform/syncGroupAuthorizationContract.js';

import { createSyncGroupRouteCanonicalRequest } from './syncGroupRouteCanonicalRequest.js';

const route: SyncGroupSecureRouteMetadata = {
  authorization_epoch: 3,
  authorization_id: 'authorization-member-a',
  endpoint_hint: 'http://127.0.0.1:38641',
  group_id: 'group-a',
  kind: 'member',
  local_member_id: 'member-a',
  peer_member_id: 'member-manager',
  protocol_version: 4,
  route_id: 'route-a-to-manager',
  state: 'active'
};

it('canonicalizes every route identity dimension before HMAC signing', () => {
  const canonical = createSyncGroupRouteCanonicalRequest(route, {
    body_hash: 'body-hash',
    method: 'post',
    nonce: 'nonce-1',
    path_with_query: '/companion/sync?cursor=3',
    timestamp: '2026-08-26T00:00:00.000Z'
  });

  expect(canonical).toBe([
    'foliole-sync-group-route-hmac-v1', 'POST', '/companion/sync?cursor=3',
    '2026-08-26T00:00:00.000Z', 'nonce-1', 'body-hash', 'group-a',
    'member-a', 'member-manager', '3', 'route-a-to-manager'
  ].join('\n'));
  expect(createHmac('sha256', Buffer.from('route-secret', 'utf8')).update(canonical).digest('hex'))
    .toBe('eef87508a1c5e75b2fa6e98aa7a9e1cf747f188bbdf7667f61f735b0fab6a83b');
});
