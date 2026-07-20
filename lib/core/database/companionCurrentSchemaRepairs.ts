import {
  ANDROID_COMPANION_MIGRATION_REPAIR_RULES,
  ANDROID_COMPANION_MIGRATION_SCHEMA_STATEMENTS
} from './androidCompanionMigrationSchemaStatements.js';

const CURRENT_REPAIR_RULE_NAMES = [
  'nodeViewStateSource',
  'syncBaseContentHash',
  'nodesEnableShortTerm',
  'nodesSequentialReadingEnabled',
  'nodesManualChildOrder',
  'nodesShelvedAt',
  'nodesImportSourceFingerprint',
  'nodesImportContentFingerprint'
] as const;

export const COMPANION_CURRENT_SCHEMA_REPAIRS = CURRENT_REPAIR_RULE_NAMES.map((name) => {
  const rule = ANDROID_COMPANION_MIGRATION_REPAIR_RULES[name];
  return {
    columnName: rule.columnName,
    statement: ANDROID_COMPANION_MIGRATION_SCHEMA_STATEMENTS[rule.statementName],
    tableName: rule.tableName
  };
});
