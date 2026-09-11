import { expect, it } from 'vitest';

import {
  projectPreparedTopologySyncStatus,
  selectPreparedJoinTarget,
  selectPreparedSyncTarget,
  type PreparedTopologyTarget
} from './syncAnchorRouteSelector.js';

const anchor: PreparedTopologyTarget = {
  device_id: 'desktop-a', endpoint_url: 'http://desktop-a:38641',
  provider_kind: 'desktop', reachable: true, role: 'anchor'
};
const mobileA: PreparedTopologyTarget = {
  device_id: 'mobile-a', endpoint_url: 'http://mobile-a:38642',
  foreground: true, provider_kind: 'mobile', reachable: true, role: null
};
const mobileB = { ...mobileA, device_id: 'mobile-b', endpoint_url: 'http://mobile-b:38642' };

it('routes ongoing sync and ordinary joining only to an anchor', () => {
  expect(selectPreparedSyncTarget([mobileA, anchor])).toEqual({ kind: 'anchor', target: anchor });
  expect(selectPreparedJoinTarget({ candidates: [mobileA, anchor], observation_complete: true,
    requester: 'mobile' })).toEqual({ kind: 'anchor', target: anchor });
});

it('lets only an unjoined desktop stably select a foreground mobile guide after observation', () => {
  expect(selectPreparedJoinTarget({ candidates: [mobileB, mobileA], observation_complete: true,
    previous_mobile_guide_id: 'mobile-b', requester: 'desktop' }))
    .toEqual({ kind: 'mobile_guide', target: mobileB });
  expect(selectPreparedJoinTarget({ candidates: [mobileA], observation_complete: true,
    requester: 'mobile' })).toEqual({ kind: 'waiting_anchor', target: null });
  expect(selectPreparedSyncTarget([mobileA])).toEqual({ kind: 'waiting_anchor', target: null });
  expect(selectPreparedJoinTarget({ candidates: [{ ...mobileA, foreground: false }],
    observation_complete: true, requester: 'desktop' }))
    .toEqual({ kind: 'waiting_anchor', target: null });
});

it('never projects waiting or incompatible topology as synced', () => {
  for (const availability of ['waiting_anchor', 'incompatible'] as const) {
    expect(projectPreparedTopologySyncStatus({ availability,
      last_synced_at: '2026-09-09T00:00:00.000Z', syncing: false })).toBe(availability);
  }
});
