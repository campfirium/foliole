export const ANDROID_COMPANION_NODE_PROVENANCE_MIGRATION_STATEMENTS = {
  nodesImportSourceFingerprintColumn: 'ALTER TABLE nodes ADD COLUMN import_source_fingerprint TEXT',
  nodesImportContentFingerprintColumn: 'ALTER TABLE nodes ADD COLUMN import_content_fingerprint TEXT'
} as const;

export const ANDROID_COMPANION_NODE_PROVENANCE_MIGRATION_ACTION_TYPES = {
  addNodesImportSourceFingerprintIfMissing: 'addNodesImportSourceFingerprintIfMissing',
  addNodesImportContentFingerprintIfMissing: 'addNodesImportContentFingerprintIfMissing'
} as const;

export const ANDROID_COMPANION_NODE_PROVENANCE_MIGRATION_PLAN_STEP = {
  actions: [
    { errorMessage: 'Failed to upgrade companion node provenance schema.', type: 'installSchema' },
    { type: 'addNodesImportSourceFingerprintIfMissing' },
    { type: 'addNodesImportContentFingerprintIfMissing' }
  ],
  beforeVersion: 19
} as const;

export const ANDROID_COMPANION_NODE_PROVENANCE_MIGRATION_REPAIR_RULES = {
  nodesImportSourceFingerprint: {
    columnName: 'import_source_fingerprint',
    errorMessage: 'Failed to add node import source fingerprint column.',
    statementName: 'nodesImportSourceFingerprintColumn',
    tableName: 'nodes'
  },
  nodesImportContentFingerprint: {
    columnName: 'import_content_fingerprint',
    errorMessage: 'Failed to add node import content fingerprint column.',
    statementName: 'nodesImportContentFingerprintColumn',
    tableName: 'nodes'
  }
} as const;
