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
    confirmingStatuses: ['accepted', 'already_applied'],
    stateSeqOptionalObjectTypes: ['node'],
    stateSeqRejectedObjectTypes: ['review_log'],
    statuses: ['accepted', 'already_applied', 'conflict', 'rejected']
  },
  resourceStatuses: ANDROID_COMPANION_RESOURCE_STATUSES,
  syncEvents: {
    completedStatus: 'completed',
    fallbackStatus: 'failed',
    skippedStatus: 'skipped',
    statuses: ['started', 'completed', 'failed', 'skipped']
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
  syncObjectTypes: {
    nodeReading: 'node_reading',
    nodeReview: 'node_review',
    settingRecord: 'setting',
    viewState: 'view_state'
  }
} as const;
