import { describe, expect, it } from 'vitest';

import { SOURCE_OWNERSHIP_SYNC_FEATURE } from '../../platform/syncAdvertisedFeatures.js';

import { evaluateSourceOwnershipReadiness, type SourceOwnershipMemberFact } from './sourceOwnershipReadiness.js';

function member(deviceId: string, kind: string, features: string[] = []): SourceOwnershipMemberFact {
  return {
    advertised_features_json: JSON.stringify(features), authorization_id: `auth-${deviceId}`,
    device_id: deviceId, device_kind: kind, joined_at: '2026-08-17T00:00:00.000Z', state: 'active'
  };
}

describe('source ownership readiness', () => {
  it('blocks an active desktop that has not advertised ownership support', () => {
    expect(evaluateSourceOwnershipReadiness({
      localMemberState: 'active', members: [member('desktop-old', 'desktop')]
    })).toEqual({ blockedMemberIds: ['desktop-old'], ready: false, reason: 'member_upgrade_required' });
  });

  it('allows supported desktops and excludes known mobile members', () => {
    expect(evaluateSourceOwnershipReadiness({
      localMemberState: 'active',
      members: [member('desktop-new', 'desktop', [SOURCE_OWNERSHIP_SYNC_FEATURE]), member('phone', 'android')]
    })).toEqual({ blockedMemberIds: [], ready: true, reason: 'ready' });
  });

  it('blocks while local membership is provisioning', () => {
    expect(evaluateSourceOwnershipReadiness({ localMemberState: 'provisioning', members: [] }).ready).toBe(false);
  });
});
