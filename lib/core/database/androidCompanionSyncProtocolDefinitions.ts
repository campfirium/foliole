export const ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS = {
  pushAck: {
    confirmingStatuses: ['accepted', 'already_applied'],
    stateSeqOptionalObjectTypes: ['node'],
    stateSeqRejectedObjectTypes: ['review_log'],
    statuses: ['accepted', 'already_applied', 'conflict', 'rejected']
  },
  syncObjectTypes: {
    nodeReading: 'node_reading',
    nodeReview: 'node_review',
    settingRecord: 'setting',
    viewState: 'view_state'
  }
} as const;
