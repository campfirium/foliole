import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { SyncGroupLifecycleAuthority } from '../../lib/core/sync/syncGroupLifecycleAuthority.js';
import { SyncGroupLifecycleStore } from '../../lib/core/sync/syncGroupLifecycleStore.js';
import {
  parseSyncGroupJoinApplication,
  SYNC_GROUP_LIFECYCLE_PREPARE_TOKEN,
  type SyncGroupLifecycleApprovalInput
} from '../../lib/platform/syncGroupLifecycleContract.js';

export interface SyncGroupLifecycleEndpointResponse {
  body: Record<string, unknown>;
  status: number;
}

export class InactiveSyncGroupLifecycleEndpoints {
  private readonly authority: SyncGroupLifecycleAuthority;
  private readonly store: SyncGroupLifecycleStore;

  constructor(
    db: DbPort,
    private readonly localMemberId: string,
    private readonly localRole: 'manager' | 'member'
  ) {
    this.authority = new SyncGroupLifecycleAuthority(db);
    this.store = new SyncGroupLifecycleStore(db);
  }

  async receiveJoinApplication(token: string, payload: unknown): Promise<SyncGroupLifecycleEndpointResponse> {
    requirePrepareToken(token);
    if (this.localRole !== 'manager') return managerRequired();
    const application = parseSyncGroupJoinApplication(payload);
    const saved = await this.authority.receiveJoinApplication(this.localMemberId, application);
    return { body: { application: saved }, status: 202 };
  }

  async loadJoinApplication(token: string, requestId: string): Promise<SyncGroupLifecycleEndpointResponse> {
    requirePrepareToken(token);
    const application = await this.store.loadJoinApplication(requestId);
    return application
      ? { body: { application }, status: 200 }
      : { body: { error: 'join_application_not_found' }, status: 404 };
  }

  async approveJoinApplication(token: string, input: Omit<SyncGroupLifecycleApprovalInput, 'actor_member_id'>) {
    requirePrepareToken(token);
    if (this.localRole !== 'manager') return managerRequired();
    const result = await this.authority.approveJoinApplication({
      ...input, actor_member_id: this.localMemberId
    });
    return { body: result as unknown as Record<string, unknown>, status: 200 };
  }

  async rejectJoinApplication(token: string, requestId: string, now: string) {
    requirePrepareToken(token);
    if (this.localRole !== 'manager') return managerRequired();
    const application = await this.authority.rejectJoinApplication(this.localMemberId, requestId, now);
    return { body: { application }, status: 200 };
  }

  async leaveLocalMember(token: string, departureId: string, now: string) {
    requirePrepareToken(token);
    const departure = await this.authority.leaveMember(this.localMemberId, departureId, now);
    return { body: { departure }, status: 200 };
  }

  async revokeMember(token: string, targetMemberId: string, departureId: string, now: string) {
    requirePrepareToken(token);
    if (this.localRole !== 'manager') return managerRequired();
    const departure = await this.authority.revokeMember(
      this.localMemberId, targetMemberId, departureId, now);
    return { body: { departure }, status: 200 };
  }
}

export function managerRequired(): SyncGroupLifecycleEndpointResponse {
  return { body: { error: 'manager_required' }, status: 409 };
}

function requirePrepareToken(value: string) {
  if (value !== SYNC_GROUP_LIFECYCLE_PREPARE_TOKEN) throw new Error('lifecycle_prepare_only');
}
