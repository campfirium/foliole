import { ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS } from '../../../lib/core/database/androidCompanionSyncProtocolDefinitions';
import type { NativeSyncObjectType, NativeSyncStateObjectRecord } from '../../../lib/platform/nativeSyncContract';

import type { SyncObjectIdentity } from './companionSyncPushProtocol';

type StateObjectIdentityRow = Pick<NativeSyncStateObjectRecord, 'object_id' | 'object_type'>;

const IDENTITY_RULES = ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS.syncStateObjectIdentity;
const SCOPED_OBJECT_TYPES = new Set<NativeSyncObjectType>(IDENTITY_RULES.scopedObjectTypes);

function isScopedStateObjectType(objectType: NativeSyncObjectType) {
  return SCOPED_OBJECT_TYPES.has(objectType);
}

function scopedObjectIdParts(objectId: string) {
  return objectId.split(IDENTITY_RULES.scopedObjectIdDelimiter, IDENTITY_RULES.scopedObjectIdPartLimit);
}

export function stateObjectIdentity(row: StateObjectIdentityRow): SyncObjectIdentity {
  return {
    objectId: row.object_id,
    objectType: row.object_type,
    scope: isScopedStateObjectType(row.object_type)
      ? scopedObjectIdParts(row.object_id)[IDENTITY_RULES.scopePartIndex] || row.object_type
      : IDENTITY_RULES.defaultScope
  };
}

export function isValidStateObjectIdentity(row: StateObjectIdentityRow) {
  if (!isScopedStateObjectType(row.object_type)) return true;
  const parts = scopedObjectIdParts(row.object_id);
  return parts.length === IDENTITY_RULES.scopedObjectIdPartLimit && parts.every((part) => part.trim().length > 0);
}
