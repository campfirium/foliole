// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const QUERY_DEFINITIONS = path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'assets', 'companion-query-definitions.json');
const NAMED_QUERY_STORE = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionNamedQueryStore.java');
const SHAPE_KEYS = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionQueryDefinitionShapeKeys.java');
const SHAPE_GENERATOR = path.join(REPO_ROOT, 'scripts/android/android-query-shape-java.mjs');
const SYNC_PAYLOAD_QUERY_STORE = path.join(
  REPO_ROOT,
  'android/app/src/main/java/com/foliole/android/FolioleCompanionSyncPayloadQueryStore.java'
);
const REVIEW_LOG_RECORD_RULES = path.join(
  REPO_ROOT,
  'android/app/src/main/java/com/foliole/android/FolioleCompanionSyncReviewLogRecordRules.java'
);
const QUERY_ASSET_KEYS = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionQueryAssetKeys.java');

describe('Android query asset shape keys', () => {
  it('generates query definition shape metadata', async () => {
    const definitions = JSON.parse(await readFile(QUERY_DEFINITIONS, 'utf8'));

    expect(definitions.assetKeys.queryShape).toBe('queryShape');
    expect(definitions.queryShape).toEqual({
      column: { key: 'key', source: 'source', type: 'type' },
      columnTypes: { double: 'double', json: 'json', long: 'long' },
      field: {
        defaultRuleKey: 'defaultRuleKey',
        defaultValue: 'defaultValue',
        omitWhenNull: 'omitWhenNull',
        outputKey: 'outputKey',
        rowKey: 'rowKey',
        type: 'type'
      },
      fieldCollections: {
        deletedAtField: 'deletedAtField',
        fields: 'fields',
        requiredRowKeys: 'requiredRowKeys',
        validStates: 'validStates'
      },
      fieldTypes: {
        booleanLong: 'booleanLong',
        contentStatus: 'contentStatus',
        defaultedString: 'defaultedString',
        double: 'double',
        json: 'json',
        kind: 'kind',
        long: 'long',
        nonNegativeLong: 'nonNegativeLong',
        nullableNonNegativeLong: 'nullableNonNegativeLong',
        nullableString: 'nullableString',
        resolvedContent: 'resolvedContent',
        string: 'string',
        title: 'title'
      },
      metricRow: { metricKey: 'metricKey', resultKey: 'resultKey', valueKey: 'valueKey' },
      query: { columns: 'columns', resultKey: 'resultKey', sql: 'sql', syncPayload: 'syncPayload' },
      diagnosticRowGroup: { outputKey: 'outputKey', queryKey: 'queryKey' },
      routing: { routes: 'routes' }
    });
  });

  it('keeps Java query readers off inline query asset field names', async () => {
    const namedQueryStore = await readFile(NAMED_QUERY_STORE, 'utf8');
    const reviewLogRecordRules = await readFile(REVIEW_LOG_RECORD_RULES, 'utf8');
    const queryAssetKeys = await readFile(QUERY_ASSET_KEYS, 'utf8');
    const shapeKeys = await readFile(SHAPE_KEYS, 'utf8');
    const shapeGenerator = await readFile(SHAPE_GENERATOR, 'utf8');
    const syncPayloadQueryStore = await readFile(SYNC_PAYLOAD_QUERY_STORE, 'utf8');
    const combinedSource = `${namedQueryStore}\n${reviewLogRecordRules}\n${syncPayloadQueryStore}`;

    expect(queryAssetKeys).toContain('FolioleCompanionQueryDefinitionShapeKeys.assetKey(key)');
    expect(queryAssetKeys).toContain('groupKey(rules, groupName)');
    expect(shapeGenerator).toContain('buildAndroidQueryShapeJava');
    expect(shapeKeys).toContain('static String assetKey(String key)');
    expect(shapeKeys).toContain('private static final String QUERY_RESULT_KEY = "resultKey";');
    expect(shapeKeys).not.toContain('FolioleCompanionAssetReader.read');
    expect(shapeKeys).not.toContain('FolioleCompanionQueryAssetKeys.section');
    expect(shapeKeys).not.toContain('new JSONObject(FolioleCompanionAssetReader.read');
    expect(combinedSource).toContain('FolioleCompanionQueryDefinitionShapeKeys.queryKey(context, "resultKey")');
    expect(combinedSource).toContain('FolioleCompanionQueryDefinitionShapeKeys.columnKey(context, "source")');
    expect(combinedSource).toContain('FolioleCompanionQueryDefinitionShapeKeys.routingKey(context, "routes")');
    expect(combinedSource).toContain('FolioleCompanionQueryDefinitionShapeKeys.metricRowResultKey(context, metricRows)');
    expect(shapeKeys).toContain('fieldOutputKey(Context context, JSONObject field)');
    expect(shapeKeys).toContain('fieldRowKey(Context context, JSONObject field)');
    expect(shapeKeys).toContain('fieldTypeKey(Context context, JSONObject field)');
    expect(shapeKeys).toContain('fieldType(Context context, String key)');
    expect(shapeKeys).toContain('diagnosticRowGroupOutputKey(Context context, JSONObject rowGroup)');
    expect(combinedSource).not.toContain('getString("sql")');
    expect(combinedSource).not.toContain('getJSONArray("columns")');
    expect(combinedSource).not.toContain('getString("source")');
    expect(combinedSource).not.toContain('getJSONObject("syncPayload")');
    expect(combinedSource).not.toContain('getJSONArray("routes")');
  });
});
