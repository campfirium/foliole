import { expect, it } from 'vitest';

import {
  createDesktopAnchorTopologyState,
  preparedObservationComplete,
  transitionDesktopAnchorTopology,
  type DesktopAnchorTopologyInput,
  type DesktopAnchorTopologyState
} from './syncAnchorTopologyStateMachine.js';

const local = 'desktop-b';
const emptyObservation: DesktopAnchorTopologyInput = {
  incompatible_group_seen: false,
  observation_complete: false,
  observed_desktops: [],
  previous_anchor_reachability: 'unknown'
};

function transition(state: DesktopAnchorTopologyState, input: Partial<DesktopAnchorTopologyInput>) {
  return transitionDesktopAnchorTopology(local, state, { ...emptyObservation, ...input });
}

it('covers first and later desktop startup without persistent leadership', () => {
  const first = transition(createDesktopAnchorTopologyState(), { observation_complete: true });
  expect(first).toMatchObject({ anchor_device_id: local, role: 'anchor' });
  const later = transition(createDesktopAnchorTopologyState(), {
    observed_desktops: [{ device_id: 'desktop-a', reachable: true, role: 'anchor' }]
  });
  expect(later).toMatchObject({ anchor_device_id: 'desktop-a', role: 'member' });
});

it('does not replace a lost anchor while its endpoint is still reachable', () => {
  const member: DesktopAnchorTopologyState = {
    anchor_device_id: 'desktop-a', pending_demote_to: null, role: 'member', status: 'ready'
  };
  expect(transition(member, {
    observation_complete: true, previous_anchor_reachability: 'reachable'
  })).toEqual(member);
  expect(transition(member, {
    observation_complete: true, previous_anchor_reachability: 'unreachable'
  })).toMatchObject({ anchor_device_id: local, role: 'anchor' });
});

it('makes a split-brain loser sync before demotion and handles old-anchor restart', () => {
  const anchor: DesktopAnchorTopologyState = {
    anchor_device_id: local, pending_demote_to: null, role: 'anchor', status: 'ready'
  };
  const observed = [{ device_id: 'desktop-a', reachable: true, role: 'anchor' as const }];
  const pending = transition(anchor, { observed_desktops: observed });
  expect(pending).toMatchObject({ pending_demote_to: 'desktop-a', role: 'anchor', status: 'sync_before_demote' });
  expect(transition(pending, { observed_desktops: observed, sync_before_demote_completed: true }))
    .toMatchObject({ anchor_device_id: 'desktop-a', role: 'member' });
  expect(transition(createDesktopAnchorTopologyState(), { observed_desktops: observed }))
    .toMatchObject({ anchor_device_id: 'desktop-a', role: 'member' });
});

it('stops on an incompatible group instead of declaring another anchor', () => {
  expect(transition(createDesktopAnchorTopologyState(), {
    incompatible_group_seen: true, observation_complete: true,
    observed_desktops: [{ device_id: 'desktop-a', reachable: true, role: 'anchor' }]
  })).toEqual({ anchor_device_id: null, pending_demote_to: null,
    role: 'observing', status: 'incompatible' });
});

it('uses an injected clock to close the complete observation window', () => {
  const clock = { now: () => 2_799 };
  expect(preparedObservationComplete(1_000, 1_800, clock)).toBe(false);
  clock.now = () => 2_800;
  expect(preparedObservationComplete(1_000, 1_800, clock)).toBe(true);
});
