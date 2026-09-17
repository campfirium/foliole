import { expect, it } from 'vitest';

import {
  appendUniqueDiscovery,
  type CompanionDiscoveryResult
} from './companionWorkspaceDiscovery';

function candidate(status: 'compatible' | 'incompatible', endpointUrl: string) {
  return {
    compatibility: {
      missing_capabilities: [],
      negotiated_version: status === 'compatible' ? 7 : null,
      reason: status === 'compatible' ? null : 'protocol_advertisement_mismatch',
      status
    },
    discovery: { group_id: 'group-1', provider_device_id: 'desktop-c' },
    endpointUrl
  } as unknown as CompanionDiscoveryResult;
}

it('prefers the compatible current advertisement for one Group Device', () => {
  const results: CompanionDiscoveryResult[] = [];
  appendUniqueDiscovery(results, candidate('incompatible', 'http://stale:38641'));
  appendUniqueDiscovery(results, candidate('compatible', 'http://current:38641'));
  appendUniqueDiscovery(results, candidate('incompatible', 'http://late-stale:38641'));

  expect(results).toHaveLength(1);
  expect(results[0]).toMatchObject({
    compatibility: { status: 'compatible' }, endpointUrl: 'http://current:38641'
  });
});
