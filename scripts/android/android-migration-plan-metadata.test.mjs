// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATION_SCHEMA = path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'assets', 'companion-migration-schema.json');
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

describe('Android migration plan metadata', () => {
  it('generates versioned migration actions in the migration schema asset', async () => {
    const schema = JSON.parse(await readFile(MIGRATION_SCHEMA, 'utf8'));

    expect(schema.actionTypes).toMatchObject({
      installSchema: 'installSchema',
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
    expect(schema.plan.map((step) => step.beforeVersion)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
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
        })
      ])
    );
  });

  it('keeps Android Java migration version orchestration driven by the generated plan', async () => {
    const migrationSource = await readFile(DATABASE_MIGRATION, 'utf8');
    const installerSource = await readFile(SCHEMA_INSTALLER, 'utf8');
    const rulesSource = await readFile(MIGRATION_RULES, 'utf8');

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
    expect(migrationSource).toContain('FolioleCompanionMigrationRules.repairStatementName(context, groupName)');
    expect(migrationSource).toContain('FolioleCompanionMigrationRules.repairTableName(context, groupName)');
    expect(migrationSource).toContain('FolioleCompanionMigrationRules.stringValue');
    expect(migrationSource).toContain('FolioleCompanionMigrationRules.rowString(context, row, key)');
    expect(migrationSource).toContain('FolioleCompanionMigrationRules.rowNullableString(context, row, key)');
    expect(migrationSource).toContain('FolioleCompanionMigrationRules.rowInt(context, row, key)');
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
