import type { DesktopAnchorRole } from './syncAnchorTopologyContract.js';

export type AnchorReachability = 'reachable' | 'unreachable' | 'unknown';
export type DesktopAnchorTopologyStatus =
  | 'observing'
  | 'ready'
  | 'waiting_anchor'
  | 'incompatible'
  | 'sync_before_demote';

export interface DesktopAnchorTopologyState {
  anchor_device_id: string | null;
  pending_demote_to: string | null;
  role: DesktopAnchorRole;
  status: DesktopAnchorTopologyStatus;
}

export interface DesktopAnchorObservation {
  device_id: string;
  reachable: boolean;
  role: DesktopAnchorRole;
}

export interface DesktopAnchorTopologyInput {
  incompatible_group_seen: boolean;
  observation_complete: boolean;
  observed_desktops: DesktopAnchorObservation[];
  previous_anchor_reachability: AnchorReachability;
  sync_before_demote_completed?: boolean;
}

export function createDesktopAnchorTopologyState(): DesktopAnchorTopologyState {
  return { anchor_device_id: null, pending_demote_to: null, role: 'observing', status: 'observing' };
}

export function transitionDesktopAnchorTopology(
  localDeviceId: string,
  state: DesktopAnchorTopologyState,
  input: DesktopAnchorTopologyInput
): DesktopAnchorTopologyState {
  if (input.incompatible_group_seen) {
    return { anchor_device_id: null, pending_demote_to: null, role: 'observing', status: 'incompatible' };
  }
  const anchors = input.observed_desktops
    .filter((peer) => peer.reachable && peer.role === 'anchor' && peer.device_id !== localDeviceId)
    .map((peer) => peer.device_id)
    .sort();
  if (state.role === 'anchor' && anchors.length > 0) {
    return resolveSplitBrain(localDeviceId, state, anchors[0]!, input.sync_before_demote_completed === true);
  }
  if (anchors.length > 0) return member(anchors[0]!);
  if (state.role === 'member' && state.anchor_device_id) {
    if (input.previous_anchor_reachability === 'reachable') return member(state.anchor_device_id);
    if (input.previous_anchor_reachability !== 'unreachable' || !input.observation_complete) {
      return { ...state, status: 'waiting_anchor' };
    }
  }
  if (!input.observation_complete) {
    return { anchor_device_id: state.anchor_device_id, pending_demote_to: null,
      role: state.role === 'member' ? 'member' : 'observing', status: 'observing' };
  }
  return { anchor_device_id: localDeviceId, pending_demote_to: null, role: 'anchor', status: 'ready' };
}

export interface PreparedTopologyClock {
  now(): number;
}

export function preparedObservationComplete(
  startedAtMs: number,
  durationMs: number,
  clock: PreparedTopologyClock
) {
  return durationMs >= 0 && clock.now() - startedAtMs >= durationMs;
}

function resolveSplitBrain(
  localDeviceId: string,
  state: DesktopAnchorTopologyState,
  remoteAnchorId: string,
  syncCompleted: boolean
): DesktopAnchorTopologyState {
  const winner = [localDeviceId, remoteAnchorId].sort()[0]!;
  if (winner === localDeviceId) {
    return { anchor_device_id: localDeviceId, pending_demote_to: null, role: 'anchor', status: 'ready' };
  }
  if (syncCompleted && state.pending_demote_to === winner) return member(winner);
  return { anchor_device_id: localDeviceId, pending_demote_to: winner,
    role: 'anchor', status: 'sync_before_demote' };
}

function member(anchorDeviceId: string): DesktopAnchorTopologyState {
  return { anchor_device_id: anchorDeviceId, pending_demote_to: null, role: 'member', status: 'ready' };
}
