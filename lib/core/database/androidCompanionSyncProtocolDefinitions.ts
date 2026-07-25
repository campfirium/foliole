import { SYNC_PACK_ENVELOPE_CONTRACT } from '../sync/syncPackEnvelopeContract.js';

import {
  ANDROID_COMPANION_SYNC_OBJECT_POLICY_DEFINITIONS,
  ANDROID_COMPANION_SYNC_OBJECT_TYPES
} from './androidCompanionSyncObjectPolicyDefinitions.js';
import { ANDROID_COMPANION_SYNC_PAYLOAD_ROUTING } from './androidCompanionSyncPayloadRoutingDefinitions.js';

export const ANDROID_COMPANION_RESOURCE_STATUSES = {
  cached: 'cached',
  empty: 'empty',
  failed: 'failed',
  fetching: 'fetching',
  missing: 'missing',
  passthroughAvailabilityStatuses: ['fetching', 'failed'],
  ready: 'ready',
  visibleBodyStatuses: ['missing', 'empty', 'fetching', 'failed']
} as const;

export const ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS = {
  pushAck: {
    clientOpIdKeys: ['client_op_id', 'clientOpId'],
    confirmingStatuses: ['accepted', 'already_applied'],
    identityKey: 'identity',
    identityObjectIdKey: 'objectId',
    identityObjectTypeKey: 'objectType',
    resultSavedClientOpIdsKey: 'saved_client_op_ids',
    stateSeqKey: 'state_seq',
    stateSeqOptionalObjectTypes: ['node'],
    stateSeqRejectedObjectTypes: ['review_log'],
    statusKey: 'status',
    statuses: ['accepted', 'already_applied', 'conflict', 'rejected']
  },
  resourceStatuses: ANDROID_COMPANION_RESOURCE_STATUSES,
  syncPackEnvelope: SYNC_PACK_ENVELOPE_CONTRACT,
  syncEvents: {
    completedStatus: 'completed',
    fullSyncCompletedMessage: 'Sync fully completed.',
    fallbackStatus: 'failed',
    skippedStatus: 'skipped',
    statuses: ['started', 'completed', 'failed', 'skipped']
  },
  syncDiagnostics: {
    host: 'android',
    connectionKeys: {
      endpointUrl: 'endpoint_url',
      lastError: 'last_error',
      state: 'state'
    },
    identityKeys: {
      appVersion: 'app_version',
      databasePath: 'database_path',
      deviceId: 'device_id',
      deviceName: 'device_name'
    },
    outputKeys: {
      collectedAt: 'collected_at',
      connection: 'connection',
      content: 'content',
      events: 'events',
      host: 'host',
      identity: 'identity',
      storage: 'storage',
      syncState: 'sync_state',
      verdicts: 'verdicts'
    },
    stateKeys: {
      dirtyObjects: 'dirty_objects',
      maxStateSeq: 'max_state_seq',
      packCursor: 'pack_cursor',
      pendingAcks: 'pending_acks',
      pushIssues: 'push_issues',
      recentConflicts: 'recent_conflicts',
      stateCounts: 'state_counts'
    },
    verdictEvidenceKeys: {
      message: 'message',
      occurredAt: 'occurred_at'
    },
    verdictKeys: {
      code: 'code',
      evidence: 'evidence',
      message: 'message',
      severity: 'severity'
    },
    verdicts: {
      endpointMissing: {
        code: 'android_endpoint_missing',
        message: 'This device has no desktop sync address.',
        severity: 'warning'
      },
      hasLocalDirtyState: {
        code: 'android_has_local_dirty_state',
        message: 'This device has changes waiting to send.',
        severity: 'info'
      },
      hasPendingPushAck: {
        code: 'android_has_pending_push_ack',
        message: 'Desktop accepted changes that are waiting for pull confirmation.',
        severity: 'info'
      },
      hasPushIssues: {
        code: 'android_has_push_issues',
        message: 'Some device changes were not sent.',
        severity: 'warning'
      },
      missingAttachmentResources: {
        code: 'android_missing_attachment_resources',
        message: 'Some attachment files are still downloading.',
        severity: 'info'
      },
      missingContentBlobs: {
        code: 'android_missing_content_blobs',
        message: 'Some topic bodies are still downloading.',
        severity: 'info'
      },
      noNodesAfterCompletedSync: {
        code: 'android_no_nodes_after_completed_sync',
        message: 'Completed sync left no topics on this device.',
        severity: 'error'
      },
      packCursorMissing: {
        code: 'android_pack_cursor_missing',
        message: 'This device has not applied a sync pack yet.',
        severity: 'info'
      },
      ready: {
        code: 'android_ready',
        message: 'Android sync state is readable.',
        severity: 'ok'
      },
      recentSyncFailed: {
        code: 'android_recent_sync_failed',
        message: 'Recent sync activity failed.',
        severity: 'error'
      }
    }
  },
  syncMetaKeys: {
    endpointUrl: 'workspace_sync_endpoint_url',
    events: 'workspace_sync_events',
    lastSyncedAt: 'workspace_sync_last_synced_at',
    onboardingStatus: 'workspace_sync_onboarding_status',
    rememberedTargets: 'workspace_sync_remembered_targets'
  },
  syncMetaOutputKeys: {
    endpointUrl: 'endpoint_url',
    lastSyncedAt: 'last_synced_at',
    rememberedTargets: 'remembered_targets',
    syncEvents: 'sync_events',
    syncOnboardingStatus: 'sync_onboarding_status',
    workspaceSnapshot: 'workspace_snapshot'
  },
  syncEventRecordKeys: {
    endpointUrl: 'endpoint_url',
    id: 'id',
    message: 'message',
    occurredAt: 'occurred_at',
    status: 'status'
  },
  syncPluginRequestKeys: {
    acks: 'acks',
    cursor: 'cursor',
    limit: 'limit',
    objectIds: 'object_ids',
    objectTypes: 'object_types'
  },
  syncCursorPayloadKeys: {
    changeId: 'change_id',
    createdAt: 'created_at',
    cursor: 'cursor'
  },
  syncMetaCursors: {
    nodeVersion: 'sync_node_version_cursor',
    nodeVersionPush: 'sync_node_version_push_cursor',
    pack: 'sync_pack_cursor',
    reviewLog: 'sync_review_log_cursor',
    reviewLogPush: 'sync_review_log_push_cursor',
    state: 'sync_state_cursor',
    statePush: 'sync_state_push_cursor'
  },
  syncOnboarding: {
    completedStatus: 'completed',
    fallbackStatus: 'pending',
    statuses: ['accepted', 'completed', 'dismissed', 'pending']
  },
  syncWrite: {
    recordKeys: {
      contentHash: 'content_hash',
      objectId: 'object_id',
      objectType: 'object_type',
      payloadJson: 'payload_json',
      updatedAt: 'updated_at'
    },
    resultKeys: {
      contentHash: 'content_hash',
      objectId: 'object_id',
      opId: 'op_id'
    },
    viewCanonicalKeys: {
      deviceId: 'device_id',
      formFactor: 'form_factor',
      key: 'key',
      platform: 'platform',
      scope: 'scope'
    }
  },
  syncStateObjectIdentity: {
    defaultScope: 'workspace',
    scopedObjectIdDelimiter: ANDROID_COMPANION_SYNC_PAYLOAD_ROUTING.objectIdDelimiter,
    scopedObjectIdPartLimit: ANDROID_COMPANION_SYNC_PAYLOAD_ROUTING.objectIdPartLimit,
    scopedObjectTypes: ['setting', 'view_state'],
    scopePartIndex: 0
  },
  syncObjectTypes: ANDROID_COMPANION_SYNC_OBJECT_TYPES,
  syncObjectPolicy: ANDROID_COMPANION_SYNC_OBJECT_POLICY_DEFINITIONS
} as const;
