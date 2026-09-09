import { expect, it, vi } from 'vitest';

import fixture from './fixtures/sync-anchor-topology-v5.json' with { type: 'json' };
import {
  PREPARED_ANCHOR_SYNC_PROTOCOL_DESCRIPTOR,
  parseDesktopAnchorRole,
  probePreparedAnchorEndpoint,
  qualifyPreparedAnchorEvidence,
  serializePreparedAnchorTxt,
  type PreparedAnchorEvidence
} from './syncAnchorTopologyContract.js';
import { SYNC_GROUP_JOIN_CONTRACT_VERSION } from './syncGroupJoinContract.js';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from './syncProtocolContract.js';

function evidence(overrides: Partial<PreparedAnchorEvidence> = {}): PreparedAnchorEvidence {
  return {
    endpoint_url: 'http://desktop-a.local:38641',
    group_id: 'group-1',
    group_tag: 'tag-1',
    provider_device_id: 'desktop-a',
    provider_kind: 'desktop',
    protocol: PREPARED_ANCHOR_SYNC_PROTOCOL_DESCRIPTOR,
    role: 'anchor',
    ...overrides
  };
}

it('keeps production sync and join contracts unchanged while preparing v5', () => {
  expect(CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version).toBe(fixture.production_protocol_version);
  expect(PREPARED_ANCHOR_SYNC_PROTOCOL_DESCRIPTOR.version).toBe(fixture.prepared_protocol_version);
  expect(SYNC_GROUP_JOIN_CONTRACT_VERSION).toBe(fixture.join_contract_version);
});

it('round-trips only the three prepared desktop roles through TXT', () => {
  for (const role of ['observing', 'member', 'anchor'] as const) {
    expect(parseDesktopAnchorRole(serializePreparedAnchorTxt(role).topology_role)).toBe(role);
  }
  expect(parseDesktopAnchorRole('leader')).toBeNull();
});

it.each([
  [{ role: 'member' as const }, {}, 'role_mismatch'],
  [{}, { provider_device_id: 'desktop-b' }, 'identity_mismatch'],
  [{}, { endpoint_url: 'http://desktop-b.local:38641' }, 'endpoint_mismatch'],
  [{ provider_kind: 'mobile' as const }, { provider_kind: 'mobile' as const }, 'provider_not_desktop'],
  [{}, { protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR }, 'protocol_incompatible']
])('rejects discontinuous TXT and HTTP anchor evidence', (advertised, discovered, reason) => {
  expect(qualifyPreparedAnchorEvidence(evidence(advertised), evidence(discovered))).toEqual({
    eligible: false, reason
  });
});

it('uses the endpoint reachability interface without changing production routing', async () => {
  const remote = evidence();
  const network = { probe: vi.fn(async () => remote) };
  const result = await probePreparedAnchorEndpoint(evidence(), network, new AbortController().signal);
  expect(result.qualification).toEqual({ eligible: true, reason: 'eligible' });
  expect(network.probe).toHaveBeenCalledWith(remote.endpoint_url, expect.any(AbortSignal));
});
