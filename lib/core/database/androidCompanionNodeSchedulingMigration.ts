export const ANDROID_COMPANION_NODE_SCHEDULING_MIGRATION_STATEMENTS = {
  nodesEnableShortTermColumn: 'ALTER TABLE nodes ADD COLUMN enable_short_term INTEGER',
  nodesManualChildOrderColumn: 'ALTER TABLE nodes ADD COLUMN manual_child_order TEXT',
  nodesSequentialReadingEnabledColumn: 'ALTER TABLE nodes ADD COLUMN sequential_reading_enabled INTEGER',
  nodesShelvedAtColumn: 'ALTER TABLE nodes ADD COLUMN shelved_at TEXT'
} as const;

export const ANDROID_COMPANION_NODE_SCHEDULING_MIGRATION_REPAIR_RULES = {
  nodesEnableShortTerm: {
    columnName: 'enable_short_term', errorMessage: 'Failed to add node short-term scheduling column.',
    statementName: 'nodesEnableShortTermColumn', tableName: 'nodes'
  },
  nodesManualChildOrder: {
    columnName: 'manual_child_order', errorMessage: 'Failed to add node manual child order column.',
    statementName: 'nodesManualChildOrderColumn', tableName: 'nodes'
  },
  nodesSequentialReadingEnabled: {
    columnName: 'sequential_reading_enabled', errorMessage: 'Failed to add node sequential reading column.',
    statementName: 'nodesSequentialReadingEnabledColumn', tableName: 'nodes'
  },
  nodesShelvedAt: {
    columnName: 'shelved_at', errorMessage: 'Failed to add node shelved topic column.',
    statementName: 'nodesShelvedAtColumn', tableName: 'nodes'
  }
} as const;
