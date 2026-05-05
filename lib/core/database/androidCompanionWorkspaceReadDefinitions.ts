export const ANDROID_COMPANION_WORKSPACE_READ_RULES = {
  groupKeys: {
    snapshot: 'snapshot',
    viewState: 'viewState'
  },
  snapshotShape: {
    nestedPayload: {
      outputKey: 'outputKey',
      stateRowKey: 'stateRowKey'
    },
    nodePayload: {
      attachmentsOutputKey: 'attachmentsOutputKey',
      bodyStatusOutputKey: 'bodyStatusOutputKey',
      bodyStatusRowKey: 'bodyStatusRowKey',
      defaultKind: 'defaultKind',
      defaultTitle: 'defaultTitle',
      validKinds: 'validKinds',
      visibleBodyStatusGroup: 'visibleBodyStatusGroup'
    }
  },
  snapshot: {
    bodyStatusExpressionToken: '__BODY_STATUS_EXPRESSION__',
    contentBlobJoinToken: '__CONTENT_BLOB_JOIN__',
    contentExpressionToken: '__CONTENT_EXPRESSION__',
    deletedAtRowKey: 'deleted_at',
    nodeIdRowKey: 'id',
    metaValueQueryName: 'workspaceMetaValue',
    metaValueResultKey: 'rows',
    nodesQueryName: 'workspaceSnapshotNodes',
    nodesResultKey: 'nodes',
    orderedNodeIdsQueryName: 'workspaceOrderedNodeIds',
    orderedNodeIdsResultKey: 'nodes',
    outputKeys: {
      activeNodeId: 'activeNodeId',
      nodeOrder: 'nodeOrder',
      nodesById: 'nodesById',
      persistedNodeViewById: 'persistedNodeViewById',
      trashedNodeIds: 'trashedNodeIds',
      untitledSequenceByParent: 'untitledSequenceByParent'
    },
    nodePayload: {
      validKinds: ['folder', 'item', 'topic'],
      defaultKind: 'topic',
      defaultTitle: 'Untitled',
      bodyStatusRowKey: 'body_status',
      bodyStatusOutputKey: 'bodyStatus',
      visibleBodyStatusGroup: 'visibleBodyStatuses',
      attachmentsOutputKey: 'attachments',
      fields: [
        { outputKey: 'id', rowKey: 'id', type: 'string' },
        { outputKey: 'parentNodeId', rowKey: 'parent_id', type: 'nullableString' },
        { outputKey: 'kind', rowKey: 'kind', type: 'kind' },
        { outputKey: 'priority', rowKey: 'priority', type: 'long', omitWhenNull: true },
        { outputKey: 'desiredRetention', rowKey: 'desired_retention', type: 'double', omitWhenNull: true },
        { outputKey: 'title', rowKey: 'title', type: 'title' },
        { outputKey: 'isTitleManual', rowKey: 'is_title_manual', type: 'booleanLong' },
        { outputKey: 'hideTitleHeading', rowKey: 'hide_title_heading', type: 'booleanLong' },
        { outputKey: 'content', rowKey: 'content', type: 'nullableString' },
        { outputKey: 'bodyBlobHash', rowKey: 'body_blob_hash', type: 'nullableString' },
        { outputKey: 'openingText', rowKey: 'opening_text', type: 'nullableString' },
        { outputKey: 'virtualFilter', rowKey: 'virtual_filter', type: 'json' },
        { outputKey: 'reveal', rowKey: 'reveal', type: 'nullableString' },
        { outputKey: 'anchorLink', rowKey: 'anchor_link', type: 'json' },
        { outputKey: 'imageRegions', rowKey: 'image_regions', type: 'json' },
        { outputKey: 'createdAt', rowKey: 'created_at', type: 'string' },
        { outputKey: 'updatedAt', rowKey: 'updated_at', type: 'string' },
        { outputKey: 'currentVersionId', rowKey: 'current_version_id', type: 'nullableString' }
      ],
      deletedAtField: { outputKey: 'deletedAt', rowKey: 'deleted_at', type: 'nullableString', omitWhenNull: true }
    },
    readingPayload: {
      outputKey: 'reading',
      requiredRowKeys: ['last_handled_at', 'next_at', 'reading_state'],
      stateRowKey: 'reading_state',
      validStates: ['active', 'done', 'dismissed'],
      fields: [
        { outputKey: 'intervalDurationMs', rowKey: 'interval_duration_ms', type: 'long', defaultValue: 0 },
        { outputKey: 'intervalGrowthFactor', rowKey: 'interval_growth_factor', type: 'double', defaultValue: 1 },
        { outputKey: 'lastHandledAt', rowKey: 'last_handled_at', type: 'nullableString' },
        { outputKey: 'nextAt', rowKey: 'next_at', type: 'nullableString' },
        { outputKey: 'priority', rowKey: 'reading_priority', type: 'double', defaultValue: 0 },
        { outputKey: 'readingPosition', rowKey: 'reading_position', type: 'long', defaultValue: 0 },
        { outputKey: 'repetitionCount', rowKey: 'repetition_count', type: 'long', defaultValue: 0 },
        { outputKey: 'state', rowKey: 'reading_state', type: 'nullableString' }
      ]
    },
    reviewPayload: {
      outputKey: 'review',
      requiredRowKeys: ['due'],
      fields: [
        { outputKey: 'due', rowKey: 'due', type: 'nullableString' },
        { outputKey: 'lastReviewAt', rowKey: 'last_review_at', type: 'nullableString' },
        { outputKey: 'state', rowKey: 'review_state', type: 'long', defaultValue: 0 },
        { outputKey: 'stability', rowKey: 'stability', type: 'double', defaultValue: 0 },
        { outputKey: 'difficulty', rowKey: 'difficulty', type: 'double', defaultValue: 0 },
        { outputKey: 'elapsedDays', rowKey: 'elapsed_days', type: 'long', defaultValue: 0 },
        { outputKey: 'scheduledDays', rowKey: 'scheduled_days', type: 'long', defaultValue: 0 },
        { outputKey: 'reps', rowKey: 'reps', type: 'long', defaultValue: 0 },
        { outputKey: 'lapses', rowKey: 'lapses', type: 'long', defaultValue: 0 }
      ]
    },
    untitledSequenceMetaKey: 'untitled_sequence_by_parent'
  },
  viewState: {
    defaultSource: 'user-scroll',
    nodeIdRowKey: 'node_id',
    queryName: 'nodeViewStatesByDevice',
    resultKey: 'states',
    fields: [
      { outputKey: 'nodeId', rowKey: 'node_id', type: 'string' },
      { outputKey: 'scrollTop', rowKey: 'scroll_top', type: 'nonNegativeLong' },
      { outputKey: 'selectionFrom', rowKey: 'selection_from', type: 'nullableNonNegativeLong' },
      { outputKey: 'selectionTo', rowKey: 'selection_to', type: 'nullableNonNegativeLong' },
      { outputKey: 'updatedAt', rowKey: 'updated_at', type: 'string' },
      { outputKey: 'source', rowKey: 'source', type: 'defaultedString', defaultRuleKey: 'defaultSource' }
    ]
  }
} as const;
