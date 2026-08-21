import type { SyncProtocolCompatibilityResult, SyncProtocolDescriptor } from '../../lib/platform/syncProtocolContract.js';

export interface PendingCompanionPairRequest {
  compatibility: SyncProtocolCompatibilityResult;
  client_address: string | null;
  host_name: string;
  host_platform: string;
  expires_at: string;
  pairing_public_key: string;
  protocol: SyncProtocolDescriptor;
  pair_request_id: string;
  requested_at: string;
  status: 'approved' | 'pending' | 'rejected';
  membership_action?: 'join_as_new_member' | 'recover_existing_member';
  member_authorization_id?: string;
  group_id?: string;
  timeline_id?: string;
}

export interface CompletedCompanionPairRequest {
  authorization_id: string;
  host_name: string;
  credential_secret: string;
  paired_at: string;
}

export interface StoredCompanionPairRequest extends PendingCompanionPairRequest {
  completion: CompletedCompanionPairRequest | null;
  expires_at_ms: number;
}

export function toPublicPairRequest(request: StoredCompanionPairRequest): PendingCompanionPairRequest {
  return {
    client_address: request.client_address,
    compatibility: request.compatibility,
    host_name: request.host_name,
    host_platform: request.host_platform,
    expires_at: request.expires_at,
    pairing_public_key: request.pairing_public_key,
    protocol: request.protocol,
    pair_request_id: request.pair_request_id,
    requested_at: request.requested_at,
    status: request.status,
    ...(request.membership_action ? { membership_action: request.membership_action } : {}),
    ...(request.member_authorization_id ? { member_authorization_id: request.member_authorization_id } : {}),
    ...(request.group_id ? { group_id: request.group_id } : {}),
    ...(request.timeline_id ? { timeline_id: request.timeline_id } : {})
  };
}
