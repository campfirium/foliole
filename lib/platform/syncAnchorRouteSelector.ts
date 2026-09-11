import type {
  DesktopAnchorRole,
  PreparedProviderKind
} from './syncAnchorTopologyContract.js';

export interface PreparedTopologyTarget {
  device_id: string;
  endpoint_url: string;
  foreground?: boolean;
  provider_kind: PreparedProviderKind;
  reachable: boolean;
  role: DesktopAnchorRole | null;
}

export type PreparedTargetSelection = {
  kind: 'anchor' | 'mobile_guide' | 'waiting_anchor';
  target: PreparedTopologyTarget | null;
};

export function selectPreparedSyncTarget(candidates: PreparedTopologyTarget[]): PreparedTargetSelection {
  const target = anchors(candidates)[0] ?? null;
  return target ? { kind: 'anchor', target } : { kind: 'waiting_anchor', target: null };
}

export function selectPreparedJoinTarget(args: {
  candidates: PreparedTopologyTarget[];
  observation_complete: boolean;
  previous_mobile_guide_id?: string | null;
  requester: 'desktop' | 'mobile';
}): PreparedTargetSelection {
  const anchor = anchors(args.candidates)[0];
  if (anchor) return { kind: 'anchor', target: anchor };
  if (args.requester === 'mobile' || !args.observation_complete) {
    return { kind: 'waiting_anchor', target: null };
  }
  const guides = args.candidates
    .filter((candidate) => candidate.provider_kind === 'mobile' && candidate.reachable && candidate.foreground === true)
    .sort(byDeviceId);
  const stable = guides.find((candidate) => candidate.device_id === args.previous_mobile_guide_id)
    ?? guides[0] ?? null;
  return stable ? { kind: 'mobile_guide', target: stable } : { kind: 'waiting_anchor', target: null };
}

export type PreparedTopologyAvailability = 'anchor_ready' | 'waiting_anchor' | 'incompatible' | 'failed';
export type PreparedTopologySyncProjection = 'syncing' | 'synced' | 'waiting_anchor' | 'incompatible' | 'failed';

export function projectPreparedTopologySyncStatus(args: {
  availability: PreparedTopologyAvailability;
  last_synced_at: string | null;
  syncing: boolean;
}): PreparedTopologySyncProjection {
  if (args.availability === 'waiting_anchor') return 'waiting_anchor';
  if (args.availability === 'incompatible') return 'incompatible';
  if (args.availability === 'failed') return 'failed';
  if (args.syncing) return 'syncing';
  return args.last_synced_at ? 'synced' : 'waiting_anchor';
}

function anchors(candidates: PreparedTopologyTarget[]) {
  return candidates.filter((candidate) => candidate.provider_kind === 'desktop' &&
    candidate.reachable && candidate.role === 'anchor').sort(byDeviceId);
}

function byDeviceId(left: PreparedTopologyTarget, right: PreparedTopologyTarget) {
  return left.device_id.localeCompare(right.device_id);
}
