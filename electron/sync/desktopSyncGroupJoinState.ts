import type {
  DesktopSyncGroupJoinCandidatePayload,
  DesktopSyncGroupJoinRequestPayload
} from '../../lib/platform/nativeCompanionSyncContract.js';

type JoinKey = Awaited<ReturnType<typeof import('./desktopSyncGroupJoinCrypto.js')['createDesktopSyncGroupJoinKey']>>;

export interface DesktopSyncGroupPendingJoin {
  candidate: DesktopSyncGroupJoinCandidatePayload;
  key: JoinKey;
  request: DesktopSyncGroupJoinRequestPayload;
}

let candidates: DesktopSyncGroupJoinCandidatePayload[] = [];
let pending: DesktopSyncGroupPendingJoin | null = null;

export function loadDesktopSyncGroupJoinState() { return { candidates, pending }; }
export function saveDesktopSyncGroupCandidates(next: DesktopSyncGroupJoinCandidatePayload[]) { candidates = next; }
export function saveDesktopSyncGroupPendingJoin(next: DesktopSyncGroupPendingJoin | null) { pending = next; }

export function refreshDesktopSyncGroupPendingJoinEndpoint(args: {
  endpointUrl: string;
  groupId: string;
  providerDeviceId: string;
}) {
  if (!pending || pending.candidate.group_id !== args.groupId ||
      pending.candidate.provider_device_id !== args.providerDeviceId) return false;
  pending = {
    ...pending,
    candidate: { ...pending.candidate, endpoint_url: args.endpointUrl },
    request: { ...pending.request, endpoint_url: args.endpointUrl }
  };
  return true;
}
