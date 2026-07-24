export const ANDROID_COMPANION_MIGRATION_ACTION_KEYS = {
  errorMessage: 'errorMessage', type: 'type'
} as const;

export const ANDROID_COMPANION_MIGRATION_ASSET_KEYS = {
  coreStatements: 'statements', migrationPlan: 'plan', migrationStatementsByName: 'statementsByName'
} as const;

export const ANDROID_COMPANION_MIGRATION_DEFAULT_MESSAGES = {
  installSchemaErrorMessage: 'Failed to install companion schema.'
} as const;

export const ANDROID_COMPANION_MIGRATION_PLAN_KEYS = {
  actions: 'actions', beforeVersion: 'beforeVersion'
} as const;

export const ANDROID_COMPANION_MIGRATION_REPAIR_RULE_KEYS = {
  columnName: 'columnName', errorMessage: 'errorMessage', statementName: 'statementName', tableName: 'tableName'
} as const;
