import { webcrypto } from 'node:crypto';

import { beforeEach, describe, expect, it } from 'vitest';

import {
  SYNC_GROUP_JOIN_CONTRACT_VERSION,
  type SyncGroupJoinRequestInput
} from '../../lib/platform/syncGroupJoinContract.js';
import {
  createCompanionSyncGroupJoinPublicKey,
  decryptCompanionSyncGroupJoinInfo,
  dropCompanionSyncGroupJoinPrivateKey
} from '../../src/shared/platform/companionSyncGroupJoinEncryption.js';

import { DesktopSyncGroupJoinProvider } from './syncGroupJoinProvider.js';

const GROUP_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const NOW = Date.parse('2026-08-26T08:00:00.000Z');

beforeEach(() => {
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
});

describe('desktop Sync Group join provider', () => {
  it('reuses one request for retries until rejection, expiration, or collection', async () => {
    const provider = createProvider();
    const applicant = await input('retry');
    const first = provider.receive(applicant, NOW);
    expect(provider.receive(applicant, NOW + 1)).toEqual(first);
    await provider.accept(first.request_id, NOW + 2);
    expect(provider.receive(applicant, NOW + 3)).toMatchObject({
      request_id: first.request_id, requested_at: first.requested_at, status: 'accepted'
    });
    provider.collect(first.request_id, NOW + 4);
    expect(provider.receive(applicant, NOW + 5).request_id).not.toBe(first.request_id);

    const rejectedApplicant = await input('rejected-retry');
    const rejected = provider.receive(rejectedApplicant, NOW + 6);
    provider.reject(rejected.request_id, NOW + 7);
    expect(provider.receive(rejectedApplicant, NOW + 8).request_id).not.toBe(rejected.request_id);
    const expiringApplicant = await input('expired-retry');
    const expiring = provider.receive(expiringApplicant, NOW + 9);
    expect(provider.receive(expiringApplicant, NOW + 120_010).request_id)
      .not.toBe(expiring.request_id);
  });

  it('treats a new ephemeral key as a distinct attempt', async () => {
    const provider = createProvider();
    const first = provider.receive(await input('attempt-a'), NOW);
    const second = provider.receive(await input('attempt-b'), NOW);
    expect(second.request_id).not.toBe(first.request_id);
  });

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
    const plaintext = await decryptCompanionSyncGroupJoinInfo(keyId, accepted.encrypted_group_info);
    expect(JSON.parse(plaintext)).toEqual({
      display_name: 'My Sync Group', group_id: 'group-a', workgroup_key: GROUP_KEY
    });
    expect(provider.collect(request.request_id, NOW + 3)).toBeNull();
    dropCompanionSyncGroupJoinPrivateKey(keyId);
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

});

describe('desktop Sync Group join admission bounds', () => {
  it('caps pending requests and releases capacity on rejection and expiration', async () => {
    const provider = createProvider();
    const requests = [];
    let firstApplicant: SyncGroupJoinRequestInput | null = null;
    for (let index = 0; index < 16; index += 1) {
      const applicant = await input(`capacity-${index}`);
      firstApplicant ??= applicant;
      requests.push(provider.receive(applicant, NOW));
    }
    expect(provider.receive(firstApplicant!, NOW).request_id).toBe(requests[0]!.request_id);
    const overflow = await input('capacity-overflow');
    expect(() => provider.receive(overflow, NOW)).toThrow('sync_group_join_capacity_exceeded');
    expect(provider.pending(NOW)).toHaveLength(16);
    provider.reject(requests[0]!.request_id, NOW);
    expect(provider.receive(await input('capacity-released'), NOW).status).toBe('pending');
    expect(provider.receive(await input('capacity-after-expiry'), NOW + 120_000).status).toBe('pending');
    expect(provider.pending(NOW + 120_000)).toHaveLength(1);
  });

  it('bounds total retention without evicting accepted requests and releases collected capacity', async () => {
    const provider = createProvider();
    const accepted = [];
    let firstApplicant: SyncGroupJoinRequestInput | null = null;
    for (let index = 0; index < 32; index += 1) {
      const applicant = await input(`accepted-capacity-${index}`);
      applicant.device.device_name += 'x'.repeat(16 * 1024 - Buffer.byteLength(JSON.stringify(applicant)));
      firstApplicant ??= applicant;
      const request = provider.receive(applicant, NOW);
      accepted.push(await provider.accept(request.request_id, NOW));
    }
    expect(provider.pending(NOW)).toEqual([]);
    expect(provider.receive(firstApplicant!, NOW).request_id).toBe(accepted[0]!.request_id);
    const overflow = await input('accepted-capacity-overflow');
    expect(() => provider.receive(overflow, NOW)).toThrow('sync_group_join_capacity_exceeded');
    expect(provider.collect(accepted[0]!.request_id, NOW)).toEqual(accepted[0]);
    expect(provider.receive(overflow, NOW).status).toBe('pending');
    for (const acceptance of accepted.slice(1)) {
      expect(provider.collect(acceptance.request_id, NOW)).toEqual(acceptance);
    }
  });

  it('rejects oversized retained fields without consuming capacity', async () => {
    const provider = createProvider();
    const applicant = await input('large');
    expect(() => provider.receive({ ...applicant, device: {
      ...applicant.device, device_name: '界'.repeat(6000)
    } }, NOW)).toThrow('request_too_large');
    expect(provider.pending(NOW)).toEqual([]);
    applicant.device.device_name += 'x'.repeat(16 * 1024 - Buffer.byteLength(JSON.stringify(applicant)));
    expect(provider.receive(applicant, NOW).status).toBe('pending');
    applicant.device.device_name += 'x';
    expect(() => provider.receive(applicant, NOW)).toThrow('request_too_large');
  });

  it('rejects requests for another group', async () => {
    const provider = createProvider();
    const otherGroup = { ...(await input('other')), group_id: 'group-b' };
    expect(() => provider.receive(otherGroup, NOW))
      .toThrow('sync_group_identity_mismatch');
  });
});

function createProvider() {
  return new DesktopSyncGroupJoinProvider({
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
    ephemeral_public_key: await createCompanionSyncGroupJoinPublicKey(keyId),
    group_id: 'group-a'
  };
}
