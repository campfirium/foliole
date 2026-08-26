import { webcrypto } from 'node:crypto';

import { beforeEach, describe, expect, it } from 'vitest';

import {
  SYNC_GROUP_JOIN_CONTRACT_VERSION,
  type SyncGroupJoinRequestInput
} from '../../lib/platform/syncGroupJoinContract.js';
import {
  createCompanionPairingPublicKey,
  decryptCompanionPairingSecret,
  dropCompanionPairingPrivateKey
} from '../../src/shared/platform/companionPairingEncryption.js';

import { DesktopSyncGroupJoinPrepareProvider } from './syncGroupJoinPrepareProvider.js';

const GROUP_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const NOW = Date.parse('2026-08-26T08:00:00.000Z');

beforeEach(() => {
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
});

describe('inactive desktop Sync Group join provider', () => {
  it('delivers only encrypted group information to the accepted request key', async () => {
    const provider = createProvider();
    const keyId = 'requester-a';
    const request = provider.receive(await input(keyId), NOW);

    expect(provider.pending(NOW)).toEqual([expect.objectContaining({
      device_name: 'Android reader', request_id: request.request_id, status: 'pending'
    })]);
    const accepted = await provider.accept(request.request_id, NOW + 1);
    expect(JSON.stringify(accepted)).not.toContain(GROUP_KEY);
    const collected = provider.collect(request.request_id, NOW + 2);
    expect(collected).toEqual(accepted);
    const plaintext = await decryptCompanionPairingSecret(keyId, accepted.encrypted_group_info);
    expect(JSON.parse(plaintext)).toEqual({
      display_name: 'My Sync Group', group_id: 'group-a', workgroup_key: GROUP_KEY
    });
    expect(provider.collect(request.request_id, NOW + 3)).toBeNull();
    dropCompanionPairingPrivateKey(keyId);
  });

  it('withholds keys before acceptance and drops rejected, expired, and restarted requests', async () => {
    const provider = createProvider();
    const rejected = provider.receive(await input('rejected'), NOW);
    expect(provider.collect(rejected.request_id, NOW)).toBeNull();
    expect(provider.reject(rejected.request_id, NOW)).toBe(true);
    const expired = provider.receive(await input('expired'), NOW);
    expect(provider.pending(NOW + 120_001)).toEqual([]);
    expect(provider.collect(expired.request_id, NOW + 120_001)).toBeNull();
    const restarted = createProvider();
    expect(restarted.pending(NOW)).toEqual([]);
  });

  it('rejects requests for another group', async () => {
    const provider = createProvider();
    const otherGroup = { ...(await input('other')), group_id: 'group-b' };
    expect(() => provider.receive(otherGroup, NOW))
      .toThrow('sync_group_identity_mismatch');
  });
});

function createProvider() {
  return new DesktopSyncGroupJoinPrepareProvider({
    display_name: 'My Sync Group', group_id: 'group-a', workgroup_key: GROUP_KEY
  });
}

async function input(keyId: string): Promise<SyncGroupJoinRequestInput> {
  return {
    contract_version: SYNC_GROUP_JOIN_CONTRACT_VERSION,
    device: {
      canonical_library_path: '/data/user/0/com.foliole.android/files/Foliole/Data/foliole.db',
      device_anchor: 'a1111111-1111-4111-8111-111111111111',
      device_name: 'Android reader', path_flavor: 'posix' as const, platform: 'android'
    },
    ephemeral_public_key: await createCompanionPairingPublicKey(keyId),
    group_id: 'group-a'
  };
}
