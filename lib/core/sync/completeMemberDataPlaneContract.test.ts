import { describe, expect, it } from 'vitest';

import {
  COMPLETE_MEMBER_DATA_PLANE_CAPABILITY,
  CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
  PREPARED_COMPLETE_MEMBER_PROTOCOL_DESCRIPTOR
} from '../../platform/syncProtocolContract.js';

import {
  COMPLETE_MEMBER_DATA_PLANE_CONTRACT,
  COMPLETE_MEMBER_PRIVATE_POLICY_KEYS,
  COMPLETE_MEMBER_SHARED_POLICY_KEYS
} from './completeMemberDataPlaneContract.js';
import { FRAMED_SYNC_STATE_OBJECT_TYPES } from './framedSyncObjectStateInventory.js';
import { SYNC_OBJECT_POLICIES } from './syncObjectPolicy.js';

describe('prepared complete member data plane contract', () => {
  it('classifies every sync policy exactly once and stops on catalog drift', () => {
    const classified = [...COMPLETE_MEMBER_SHARED_POLICY_KEYS, ...COMPLETE_MEMBER_PRIVATE_POLICY_KEYS];
    expect(new Set(classified).size).toBe(classified.length);
    expect([...classified].sort()).toEqual(SYNC_OBJECT_POLICIES.map(({ key }) => key).sort());

    const shared = SYNC_OBJECT_POLICIES.filter(({ key }) => (
      COMPLETE_MEMBER_SHARED_POLICY_KEYS.includes(key as never)
    ));
    expect(shared.filter(({ scope, key }) => (
      scope !== 'workspace' && scope !== 'event' && key !== 'content_blobs'
    ))).toEqual([]);
    expect(SYNC_OBJECT_POLICIES.filter(({ scope }) => scope === 'host' || scope === 'device')
      .every(({ key }) => COMPLETE_MEMBER_PRIVATE_POLICY_KEYS.includes(key as never))).toBe(true);
  });

  it('maps every shared object to the current request or resource surface', () => {
    const carriedTypes = new Set<string>(['node', ...FRAMED_SYNC_STATE_OBJECT_TYPES]);
    const missing = SYNC_OBJECT_POLICIES.filter(({ key }) => (
      COMPLETE_MEMBER_SHARED_POLICY_KEYS.includes(key as never)
    )).filter(({ key, objectType }) => (
      key !== 'content_blobs' && key !== 'review_log' && (!objectType || !carriedTypes.has(objectType as never))
    ));
    expect(missing).toEqual([]);
    expect(COMPLETE_MEMBER_DATA_PLANE_CONTRACT.resourceKinds).toEqual(['attachment', 'content_blob']);
    expect(COMPLETE_MEMBER_DATA_PLANE_CONTRACT.lifecycle).toEqual(['delete', 'restore']);
  });

  it('keeps the complete member capability in the production v28 descriptor', () => {
    expect(CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version).toBe(31);
    expect(CURRENT_SYNC_PROTOCOL_DESCRIPTOR.capabilities).toContain(COMPLETE_MEMBER_DATA_PLANE_CAPABILITY);
    expect(PREPARED_COMPLETE_MEMBER_PROTOCOL_DESCRIPTOR).toMatchObject({
      version: 31,
      min_supported_version: 31,
      max_supported_version: 31
    });
    expect(PREPARED_COMPLETE_MEMBER_PROTOCOL_DESCRIPTOR.capabilities)
      .toContain(COMPLETE_MEMBER_DATA_PLANE_CAPABILITY);
  });
});
