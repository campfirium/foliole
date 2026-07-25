export const ANDROID_COMPANION_DIAGNOSTIC_READ_RULES = {
  activeTopic: { queryName: 'diagnosticActiveTopic', resultKey: 'topics' },
  content: {
    outputKeys: {
      activeTopic: 'active_topic',
      recentTopics: 'recent_topics'
    },
    bodyMetricKeys: [
      'missing_topic_body_count',
      'missing_top_level_topic_body_count',
      'missing_nested_topic_body_count',
      'missing_external_document_body_count',
      'missing_due_review_body_count',
      'missing_active_topic_body_count'
    ]
  },
  contentBodyMetrics: { queryName: 'diagnosticContentBodyMetrics' },
  dirtyObjects: { queryName: 'diagnosticDirtyObjects', resultKey: 'objects' },
  metaValue: { queryName: 'companionMetaValue' },
  metricRows: { resultKey: 'metrics', metricKey: 'metric', valueKey: 'value' },
  pendingAcks: { queryName: 'diagnosticPendingAcks', resultKey: 'acks' },
  nodeConflicts: { queryName: 'nodeConflicts', resultKey: 'conflicts' },
  pushIssues: { queryName: 'diagnosticPushIssues', resultKey: 'acks' },
  recentTopics: { queryName: 'diagnosticRecentTopics', resultKey: 'topics' },
  stateCounts: { queryName: 'diagnosticSyncStateCounts', resultKey: 'counts' },
  stateRowGroups: [
    { outputKey: 'dirtyObjects', queryKey: 'dirtyObjects' },
    { outputKey: 'pendingAcks', queryKey: 'pendingAcks' },
    { outputKey: 'pushIssues', queryKey: 'pushIssues' },
    { outputKey: 'recentConflicts', queryKey: 'nodeConflicts' },
    { outputKey: 'stateCounts', queryKey: 'stateCounts' }
  ],
  stateMetrics: { queryName: 'diagnosticSyncStateMetrics' },
  storageMetrics: { queryName: 'diagnosticStorageMetrics' },
  verdictMetricKeys: {
    activeNodeCount: 'active_node_count',
    localDirtyCount: 'local_dirty_count',
    missingAttachmentResourceCount: 'missing_attachment_resource_count',
    missingContentBlobCount: 'missing_content_blob_count',
    pendingAckCount: 'pending_ack_count',
    pushIssueCount: 'push_issue_count'
  }
} as const;
