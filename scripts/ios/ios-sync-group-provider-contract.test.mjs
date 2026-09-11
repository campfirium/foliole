// @vitest-environment node
/* global Buffer */
import { createHash, createHmac } from 'node:crypto';

import { expect, it } from 'vitest';

import { SYNC_GROUP_JOIN_CONTRACT_VERSION } from '../../lib/platform/syncGroupJoinContract.ts';
import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.ts';
import {
  decryptWorkgroupPayloadNode,
  encryptWorkgroupPayloadNode
} from '../../electron/sync/workgroupAeadNode.ts';
import {
  createCompanionSyncGroupJoinPublicKey,
  decryptCompanionSyncGroupJoinInfo,
  dropCompanionSyncGroupJoinPrivateKey
} from '../../src/shared/platform/companionSyncGroupJoinEncryption.ts';

import { createIosSyncGroupProviderContract } from './ios-sync-group-provider-contract.ts';
import { createIosSyncGroupProviderObservations } from './ios-sync-group-provider-observations.ts';

const ANCHOR = 'a1111111-1111-4111-8111-111111111111';
const LIBRARY = '/acceptance/foliole.db';

it('uses explicit request acceptance, one-time collection, and joined workgroup auth', async () => {
  const observations = createIosSyncGroupProviderObservations();
  const provider = createIosSyncGroupProviderContract(observations);
  const keyId = 'ios-provider-contract';
  try {
    const request = await provider.accept({
      contract_version: SYNC_GROUP_JOIN_CONTRACT_VERSION,
      device: {
        canonical_library_path: LIBRARY, device_anchor: ANCHOR,
        device_name: 'Acceptance iPhone', path_flavor: 'posix', platform: 'ios-capacitor'
      },
      ephemeral_public_key: await createCompanionSyncGroupJoinPublicKey(keyId),
      group_id: provider.discovery.group_id
    });
    expect(observations).toMatchObject({
      acceptance_explicit: true, acceptance_request_id: request.request_id,
      group_key_absent_before_accept: true, request_statuses: ['requested', 'accepted']
    });
    const acceptance = provider.collect(request.request_id);
    expect(acceptance).not.toBeNull();
    expect(provider.collect(request.request_id)).toBeNull();
    const info = JSON.parse(await decryptCompanionSyncGroupJoinInfo(keyId, acceptance.encrypted_group_info));
    expect(info).toMatchObject({ group_id: provider.discovery.group_id });
    expect(provider.discovery.group_tag).toMatch(/^[0-9a-f]{32}$/u);
    expect(provider.authenticate(signedRequest(info.workgroup_key, provider.discovery.group_id))).toBe(true);
    verifyEncryptedRoundTrip(provider, info.workgroup_key, provider.discovery.group_id);
    expect(observations.accepted_device_id).toBe(createSyncGroupDeviceIdentity({
      device_anchor: ANCHOR, group_id: provider.discovery.group_id,
      library_path: LIBRARY, path_flavor: 'posix'
    }).identity_key);
    expect(observations.acceptance_collected_count).toBe(1);
  } finally {
    dropCompanionSyncGroupJoinPrivateKey(keyId);
  }
});

function verifyEncryptedRoundTrip(provider, secret, groupId) {
  const method = 'POST', path = '/companion/sync-push', contentType = 'application/json; charset=utf-8';
  const plaintext = Buffer.from('{"items":[]}');
  const context = {
    contentType, direction: 'request', groupTag: provider.discovery.group_tag,
    method, pathWithQuery: path
  };
  const wireBody = JSON.stringify(encryptWorkgroupPayloadNode({ context, groupKey: secret, plaintext }));
  const request = signedRequest(secret, groupId, { bodyText: wireBody, method, path });
  expect(provider.authenticate(request, wireBody)).toBe(true);
  expect(provider.decryptRequest(request, wireBody)).toBe(plaintext.toString('utf8'));
  const responseBody = Buffer.from('{"acks":[]}');
  const encrypted = provider.encryptResponse(request, responseBody, contentType);
  expect(decryptWorkgroupPayloadNode({
    context: { ...context, direction: 'response' },
    envelope: JSON.parse(encrypted.toString('utf8')),
    groupKey: secret
  })).toEqual(responseBody);
}

function signedRequest(secret, groupId, options = {}) {
  const method = options.method ?? 'GET', path = options.path ?? '/acceptance/signed', nonce = 'nonce-1';
  const timestamp = new Date().toISOString();
  const bodyText = options.bodyText ?? '';
  const bodyHash = createHash('sha256').update(bodyText).digest('hex');
  const signature = createHmac('sha256', secret)
    .update([method, path, timestamp, nonce, bodyHash].join('\n')).digest('hex');
  return {
    headers: {
      'x-device-id': createSyncGroupDeviceIdentity({
        device_anchor: ANCHOR, group_id: groupId, library_path: LIBRARY, path_flavor: 'posix'
      }).identity_key,
      'x-nonce': nonce, 'x-signature': signature, 'x-sync-group-id': groupId,
      'x-timestamp': timestamp
    },
    method,
    url: path
  };
}
