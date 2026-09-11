import { expect, it } from 'vitest';

import fixture from '../../../../lib/platform/fixtures/sync-anchor-topology-v5.json' with { type: 'json' };
import {
  PREPARED_ANCHOR_SYNC_PROTOCOL_DESCRIPTOR,
  serializePreparedAnchorTxt
} from '../../../../lib/platform/syncAnchorTopologyContract';

import {
  projectPreparedCompanionTopologyStatus,
  qualifyPreparedCompanionAnchorCandidate
} from './preparedAnchorDiscovery';

it('uses the shared host fixture to keep Android and iOS consumers anchor-only', () => {
  for (const hostCase of fixture.host_cases) {
    const platform = hostCase.provider_kind === 'desktop' ? 'darwin' : 'android-capacitor';
    const qualification = qualifyPreparedCompanionAnchorCandidate({
      endpoint_url: `http://${hostCase.id}:38641`,
      http: { group_id: 'group-1', group_tag: 'tag-1', provider_device_id: hostCase.id,
        provider_platform: platform, protocol: PREPARED_ANCHOR_SYNC_PROTOCOL_DESCRIPTOR,
        topology_role: hostCase.http_role },
      protocol_txt: { ...serializePreparedAnchorTxt(hostCase.txt_role as 'anchor' | 'member'),
        device_id: hostCase.id, group_id: 'group-1', group_tag: 'tag-1',
        provider_platform: platform, topology_role: hostCase.txt_role }
    });
    expect(qualification.eligible, hostCase.id).toBe(hostCase.accepted_as_anchor);
  }
});

it('does not let companion waiting or incompatibility look synced', () => {
  expect(projectPreparedCompanionTopologyStatus({ availability: 'waiting_anchor',
    last_synced_at: '2026-09-09T00:00:00.000Z', syncing: false })).toBe('waiting_anchor');
  expect(projectPreparedCompanionTopologyStatus({ availability: 'incompatible',
    last_synced_at: '2026-09-09T00:00:00.000Z', syncing: false })).toBe('incompatible');
});
