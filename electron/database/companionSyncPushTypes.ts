type SyncPushStatus = 'accepted' | 'already_applied' | 'conflict' | 'rejected';

type SyncBaseReference =
  | { kind: 'blocked'; reason: 'invalid_identity' | 'missing_base_reference' }
  | { baseContentHash: string | null; kind: 'content_hash' }
  | { kind: 'op_id'; opId: string }
  | { ancestorVersionIds: string[]; kind: 'node_version'; parentVersionId: string | null; parentVersionIds?: string[] };

export interface SyncObjectIdentity {
  objectId: string;
  objectType: string;
  scope: string;
}

export interface CompanionSyncPushPayload {
  authorHostName: string;
  base: SyncBaseReference;
  clientOpId: string;
  contentHash?: string;
  deletedAt?: string | null;
  identity: SyncObjectIdentity;
  payloadJson: string | null;
  updatedAt?: string;
}

interface CompanionSyncPushAck {
  canonicalObjectId?: string;
  clientOpId: string;
  conflictReason?: string;
  desktopBase?: SyncBaseReference;
  identity: SyncObjectIdentity;
  stateSeq?: number | null;
  status: SyncPushStatus;
  versionId?: string | null;
}

export interface CompanionSyncPushResult {
  acks: CompanionSyncPushAck[];
  appliedNodeIds: string[];
  appliedObjectIds: string[];
  appliedReviewOpIds: string[];
}
