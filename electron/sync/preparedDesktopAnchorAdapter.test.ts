import { expect, it } from 'vitest';

import fixture from '../../lib/platform/fixtures/sync-anchor-topology-v6.json' with { type: 'json' };
import { PREPARED_ANCHOR_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncAnchorTopologyContract.js';

import {
  createPreparedDesktopAnchorTxt,
  projectPreparedDesktopTopologyStatus,
  qualifyPreparedDesktopAnchorCandidate
} from './preparedDesktopAnchorAdapter.js';

it('uses the shared host fixture to produce and consume prepared desktop roles', () => {
  for (const hostCase of fixture.host_cases) {
    const platform = hostCase.provider_kind === 'desktop' ? 'darwin' : 'ios-capacitor';
    const txt = { ...createPreparedDesktopAnchorTxt({ device_id: hostCase.id,
      group_id: 'group-1', group_tag: 'tag-1', role: hostCase.txt_role as 'anchor' | 'member' }),
      provider_platform: platform };
    const qualification = qualifyPreparedDesktopAnchorCandidate({
      endpoint_url: `http://${hostCase.id}:38641`,
      http: { group_id: 'group-1', group_tag: 'tag-1', provider_device_id: hostCase.id,
        provider_platform: platform, protocol: PREPARED_ANCHOR_SYNC_PROTOCOL_DESCRIPTOR,
        topology_role: hostCase.http_role },
      txt
    });
    expect(qualification.eligible, hostCase.id).toBe(hostCase.accepted_as_anchor);
  }
});

it('does not let desktop waiting or incompatibility look synced', () => {
  expect(projectPreparedDesktopTopologyStatus({ availability: 'waiting_anchor',
    last_synced_at: '2026-09-09T00:00:00.000Z', syncing: false })).toBe('waiting_anchor');
  expect(projectPreparedDesktopTopologyStatus({ availability: 'incompatible',
    last_synced_at: '2026-09-09T00:00:00.000Z', syncing: false })).toBe('incompatible');
});

it('recognizes a readable Windows 11 platform as a desktop anchor', () => {
  const evidence = {
    group_id: 'group-1',
    group_tag: 'tag-1',
    provider_device_id: 'windows-device',
    provider_platform: 'Windows 11',
    protocol: PREPARED_ANCHOR_SYNC_PROTOCOL_DESCRIPTOR,
    topology_role: 'anchor'
  };
  expect(qualifyPreparedDesktopAnchorCandidate({
    endpoint_url: 'http://windows-11:38641',
    http: evidence,
    txt: { ...evidence, device_id: 'windows-device' }
  }).eligible).toBe(true);
});
