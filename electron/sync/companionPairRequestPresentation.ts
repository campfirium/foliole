import type { SyncProtocolCompatibilityResult, SyncProtocolDescriptor } from '../../lib/platform/syncProtocolContract.js';

export interface PendingCompanionPairRequest {
  compatibility: SyncProtocolCompatibilityResult;
  client_address: string | null;
  device_id: string;
  device_kind: string;
  device_name: string;
  expires_at: string;
  pairing_public_key: string;
  protocol: SyncProtocolDescriptor;
  pair_request_id: string;
  requested_at: string;
  status: 'approved' | 'pending' | 'rejected';
  membership_action?: 'join_as_new_member' | 'recover_existing_member';
  group_id?: string;
  timeline_id?: string;
}

export interface CompletedCompanionPairRequest {
  device_id: string;
  device_secret: string;
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
    device_id: request.device_id,
    device_kind: request.device_kind,
    device_name: request.device_name,
    expires_at: request.expires_at,
    pairing_public_key: request.pairing_public_key,
    protocol: request.protocol,
    pair_request_id: request.pair_request_id,
    requested_at: request.requested_at,
    status: request.status,
    ...(request.membership_action ? { membership_action: request.membership_action } : {}),
    ...(request.group_id ? { group_id: request.group_id } : {}),
    ...(request.timeline_id ? { timeline_id: request.timeline_id } : {})
  };
}
