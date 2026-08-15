export const ANDROID_COMPANION_WORKGROUP_KEY_MIGRATION_STATEMENTS = {
  syncGroupsWorkgroupKeyColumn: 'ALTER TABLE sync_groups ADD COLUMN workgroup_key TEXT'
} as const;

export const ANDROID_COMPANION_WORKGROUP_KEY_MIGRATION_ACTION_TYPES = {
  addSyncGroupsWorkgroupKeyIfMissing: 'addSyncGroupsWorkgroupKeyIfMissing'
} as const;

export const ANDROID_COMPANION_WORKGROUP_KEY_MIGRATION_PLAN_STEP = {
  actions: [
    { errorMessage: 'Failed to install Sync Group key storage.', type: 'installSchema' },
    { type: 'addSyncGroupsWorkgroupKeyIfMissing' }
  ],
  beforeVersion: 26
} as const;

export const ANDROID_COMPANION_WORKGROUP_KEY_MIGRATION_REPAIR_RULES = {
  syncGroupsWorkgroupKey: {
    columnName: 'workgroup_key',
    errorMessage: 'Failed to add Sync Group workgroup key column.',
    statementName: 'syncGroupsWorkgroupKeyColumn',
    tableName: 'sync_groups'
  }
} as const;
