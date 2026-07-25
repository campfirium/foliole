// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATION_SCHEMA = path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'assets', 'companion-migration-schema.json');
const DATABASE_HELPER = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'foliole',
  'android',
  'FolioleCompanionDatabaseHelper.java'
);
const DATABASE_MIGRATION = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'foliole',
  'android',
  'FolioleCompanionDatabaseMigration.java'
);
const SCHEMA_INSTALLER = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'foliole',
  'android',
  'FolioleCompanionSchemaInstaller.java'
);
const SCHEMA_REPAIR = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'foliole',
  'android',
  'FolioleCompanionSchemaRepair.java'
);
const MIGRATION_RULES = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'foliole',
  'android',
  'FolioleCompanionMigrationRules.java'
);
const MIGRATION_ROW_VALUES = path.join(
  REPO_ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'foliole', 'android',
  'FolioleCompanionMigrationRowValues.java'
);

describe('Android migration plan metadata', () => {
  it('generates versioned migration actions in the migration schema asset', async () => {
    const schema = JSON.parse(await readFile(MIGRATION_SCHEMA, 'utf8'));
    const helperSource = await readFile(DATABASE_HELPER, 'utf8');
    const databaseVersion = Number(helperSource.match(/DATABASE_VERSION = (\d+)/)?.[1]);

    expect(schema.actionTypes).toMatchObject({
      addNodesImportContentFingerprintIfMissing: 'addNodesImportContentFingerprintIfMissing',
      addNodesImportSourceFingerprintIfMissing: 'addNodesImportSourceFingerprintIfMissing',
      addNodesManualChildOrderIfMissing: 'addNodesManualChildOrderIfMissing',
      addNodesAnchorResolutionStatusIfMissing: 'addNodesAnchorResolutionStatusIfMissing',
      addNodesAnchorSourceVersionIdIfMissing: 'addNodesAnchorSourceVersionIdIfMissing',
      addNodeSyncVersionsBodyTextIfMissing: 'addNodeSyncVersionsBodyTextIfMissing',
      backfillSyncConflictConvergence: 'backfillSyncConflictConvergence',
      addNodesSequentialReadingEnabledIfMissing: 'addNodesSequentialReadingEnabledIfMissing',
      addNodesShelvedAtIfMissing: 'addNodesShelvedAtIfMissing',
      installSchema: 'installSchema',
      migrateExternalFolderOwnership: 'migrateExternalFolderOwnership',
      migrateSyncObjectStateSequence: 'migrateSyncObjectStateSequence'
    });
    expect(schema.actionKeys).toMatchObject({ errorMessage: 'errorMessage', type: 'type' });
    expect(schema.assetKeys).toMatchObject({
      coreStatements: 'statements',
      migrationPlan: 'plan',
      migrationStatementsByName: 'statementsByName'
    });
    expect(schema.planKeys).toMatchObject({ actions: 'actions', beforeVersion: 'beforeVersion' });
    expect(schema.repairRuleKeys).toMatchObject({
      columnName: 'columnName',
      errorMessage: 'errorMessage',
      statementName: 'statementName',
      tableName: 'tableName'
    });
    expect(schema.plan.map((step) => step.beforeVersion)).toEqual([21, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22]);
    expect(schema.plan[0]?.actions).toEqual([{ type: 'migrateExternalFolderOwnership' }]);
    expect(databaseVersion).toBe(Math.max(...schema.plan.map((step) => step.beforeVersion)));
    expect(schema.repairRules.nodesSequentialReadingEnabled).toMatchObject({
      columnName: 'sequential_reading_enabled',
      statementName: 'nodesSequentialReadingEnabledColumn',
      tableName: 'nodes'
    });
    expect(schema.repairRules.nodesShelvedAt).toMatchObject({
      columnName: 'shelved_at',
      statementName: 'nodesShelvedAtColumn',
      tableName: 'nodes'
    });
    expect(schema.repairRules.nodesManualChildOrder).toMatchObject({
      columnName: 'manual_child_order',
      statementName: 'nodesManualChildOrderColumn',
      tableName: 'nodes'
    });
    expect(schema.repairRules.nodesImportSourceFingerprint).toMatchObject({
      columnName: 'import_source_fingerprint',
      statementName: 'nodesImportSourceFingerprintColumn',
      tableName: 'nodes'
    });
    expect(schema.repairRules.nodesImportContentFingerprint).toMatchObject({
      columnName: 'import_content_fingerprint',
      statementName: 'nodesImportContentFingerprintColumn',
      tableName: 'nodes'
    });
    expect(schema.repairRules.nodesAnchorResolutionStatus).toMatchObject({
      columnName: 'anchor_resolution_status',
      statementName: 'nodesAnchorResolutionStatusColumn',
      tableName: 'nodes'
    });
    expect(schema.repairRules.nodesAnchorSourceVersionId).toMatchObject({
      columnName: 'anchor_source_version_id',
      statementName: 'nodesAnchorSourceVersionIdColumn',
      tableName: 'nodes'
    });
    expect(schema.repairRules.nodeSyncVersionsBodyText).toMatchObject({
      columnName: 'body_text',
      statementName: 'nodeSyncVersionsBodyTextColumn',
      tableName: 'node_sync_versions'
    });
    expect(schema.repairRules.syncObjectStateSequence).toMatchObject({
      legacyRowsQueryName: 'migrationLegacySyncObjectStateRows',
      nextInsertMutationName: 'migrationSyncObjectStateNextInsert',
      stateSeqColumnName: 'state_seq',
      tableName: 'sync_object_state'
    });
    expect(schema.plan).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actions: expect.arrayContaining([
            expect.objectContaining({ type: 'migrateSyncObjectStateSequence' }),
            expect.objectContaining({ type: 'installSchema' })
          ]),
          beforeVersion: 5
        }),
        expect.objectContaining({
          actions: [expect.objectContaining({ type: 'backfillNodeAttachmentsFromVersions' })],
          beforeVersion: 9
        }),
        expect.objectContaining({
          actions: expect.arrayContaining([
            expect.objectContaining({ type: 'installSchema' }),
            expect.objectContaining({ type: 'addSyncBaseContentHashIfMissing' })
          ]),
          beforeVersion: 13
        }),
        expect.objectContaining({
          actions: expect.arrayContaining([
            expect.objectContaining({ type: 'addNodesImportSourceFingerprintIfMissing' }),
            expect.objectContaining({ type: 'addNodesImportContentFingerprintIfMissing' })
          ]),
          beforeVersion: 19
        })
      ])
    );
  });

  it('keeps Android Java migration version orchestration driven by the generated plan', async () => {
    const helperSource = await readFile(DATABASE_HELPER, 'utf8');
    const migrationSource = await readFile(DATABASE_MIGRATION, 'utf8');
    const repairSource = await readFile(SCHEMA_REPAIR, 'utf8');
    const installerSource = await readFile(SCHEMA_INSTALLER, 'utf8');
    const rulesSource = await readFile(MIGRATION_RULES, 'utf8');
    const rowValuesSource = await readFile(MIGRATION_ROW_VALUES, 'utf8');

    expect(helperSource).toContain('public void onOpen(SQLiteDatabase database)');
    expect(helperSource).toContain('FolioleCompanionDatabaseMigration.repairCurrentSchema(context, database)');
    expect(migrationSource).toContain('static void repairCurrentSchema(Context context, SQLiteDatabase database)');
    expect(migrationSource).toContain('FolioleCompanionSchemaRepair.repairCurrentSchema(context, database)');
    expect(repairSource).toContain('addNodesSequentialReadingEnabledIfMissing(context, database)');
    expect(repairSource).toContain('addNodesImportSourceFingerprintIfMissing(context, database)');
    expect(repairSource).toContain('addNodesImportContentFingerprintIfMissing(context, database)');
    expect(repairSource).toContain('FolioleCompanionMigrationRules.repairColumnName(context, groupName)');
    expect(installerSource).toContain('static JSONArray migrationPlan(Context context)');
    expect(rulesSource).toContain('section(context, "actionTypes")');
    expect(rulesSource).toContain('section(context, "actionKeys")');
    expect(rulesSource).toContain('section(context, "assetKeys")');
    expect(rulesSource).toContain('section(context, "planKeys")');
    expect(rulesSource).toContain('section(context, "repairRuleKeys")');
    expect(rulesSource).toContain('section(context, "repairRules")');
    expect(installerSource).toContain('FolioleCompanionMigrationRules.assetKey(context, "coreStatements")');
    expect(installerSource).not.toContain('optJSONArray("statements")');
    expect(installerSource).not.toContain('optJSONObject("statementsByName")');
    expect(installerSource).not.toContain('optJSONArray("plan")');
    expect(migrationSource).toContain('FolioleCompanionSchemaInstaller.migrationPlan(context)');
    expect(migrationSource).toContain('FolioleCompanionMigrationRules.actionType(context, key)');
    expect(repairSource).toContain('FolioleCompanionMigrationRules.repairStatementName(context, groupName)');
    expect(repairSource).toContain('FolioleCompanionMigrationRules.repairTableName(context, groupName)');
    expect(migrationSource).toContain('FolioleCompanionMigrationRules.stringValue');
    expect(rowValuesSource).toContain('FolioleCompanionMigrationRules.rowString(context, row, key)');
    expect(rowValuesSource).toContain('FolioleCompanionMigrationRules.rowNullableString(context, row, key)');
    expect(rowValuesSource).toContain('FolioleCompanionMigrationRules.rowInt(context, row, key)');
    expect(migrationSource).toContain('oldVersion < step.getInt(planKey(context, "beforeVersion"))');
    expect(migrationSource).toContain('step.getJSONArray(planKey(context, "actions"))');
    expect(migrationSource).not.toContain('"installSchema".equals(type)');
    expect(migrationSource).not.toContain('"migrateSyncObjectStateSequence".equals(type)');
    expect(migrationSource).not.toContain('step.getInt("beforeVersion")');
    expect(migrationSource).not.toContain('step.getJSONArray("actions")');
    expect(migrationSource).not.toContain('action.optString("type"');
    expect(migrationSource).not.toContain('repairRuleValue(context, "syncBaseContentHash", "statementName")');
    expect(migrationSource).not.toContain('repairRuleValue(context, "syncBaseContentHash", "errorMessage")');
    expect(migrationSource).not.toContain('repairRuleValue(context, "nodeViewStateSource", "statementName")');
    expect(migrationSource).not.toContain('repairRuleValue(context, "nodeViewStateSource", "errorMessage")');
    expect(migrationSource).not.toContain('repairRuleKey(context, "statementName")');
    expect(migrationSource).not.toContain('oldVersion < 4');
    expect(migrationSource).not.toContain('oldVersion < 14');
    expect(migrationSource).not.toContain('"migrationLegacySyncObjectStateRows"');
    expect(migrationSource).not.toContain('row.getString(rowKey(context');
    expect(migrationSource).not.toContain('row.getInt(rowKey(context');
    expect(migrationSource).not.toContain('Failed to upgrade companion push ack schema.');
  });
});
