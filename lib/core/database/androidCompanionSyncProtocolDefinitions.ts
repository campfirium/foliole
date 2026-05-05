export const ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS = {
  pushAck: {
    confirmingStatuses: ['accepted', 'already_applied'],
    stateSeqOptionalObjectTypes: ['node'],
    stateSeqRejectedObjectTypes: ['review_log'],
    statuses: ['accepted', 'already_applied', 'conflict', 'rejected']
  },
  syncEvents: {
    completedStatus: 'completed',
    fallbackStatus: 'failed',
    skippedStatus: 'skipped',
    statuses: ['started', 'completed', 'failed', 'skipped']
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
