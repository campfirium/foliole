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
