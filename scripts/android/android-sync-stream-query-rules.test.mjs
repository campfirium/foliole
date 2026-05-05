// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ANDROID_COMPANION_SYNC_STREAM_READ_RULES } from '../../lib/core/database/androidCompanionSyncQueryDefinitions.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const QUERY_DEFINITIONS = path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'assets', 'companion-query-definitions.json');
const NODE_VERSION_STORE = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionSyncNodeVersionStore.java');
const REVIEW_LOG_RECORD_RULES = path.join(
  REPO_ROOT,
  'android/app/src/main/java/com/foliole/android/FolioleCompanionSyncReviewLogRecordRules.java'
);
const REVIEW_LOG_STORE = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionSyncReviewLogStore.java');
const STREAM_RULES = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionSyncStreamQueryRules.java');

describe('Android sync stream query rules', () => {
  it('generates cursor, limit, and ancestor rules for sync streams', async () => {
    const definitions = JSON.parse(await readFile(QUERY_DEFINITIONS, 'utf8'));

    expect(definitions.syncStreamRead).toEqual(ANDROID_COMPANION_SYNC_STREAM_READ_RULES);
    expect(definitions.syncStreamRead.groupKeys).toEqual({
      nodeVersions: 'nodeVersions',
      reviewLog: 'reviewLog'
    });
    expect(definitions.syncStreamRead.nodeVersions).toMatchObject({
      ancestorDepthLimit: 1000,
      ancestorVersionIdsKey: 'ancestor_version_ids',
      parentQueryName: 'syncNodeVersionParent',
      queryName: 'syncNodeVersions'
    });
    expect(definitions.syncStreamRead.reviewLog).toMatchObject({
      cursorChangeIdKey: 'change_id',
      cursorCreatedAtKey: 'created_at',
      queryName: 'syncReviewLog'
    });
  });

  it('keeps node version and review log stores wired to generated stream rules', async () => {
    const nodeVersionSource = await readFile(NODE_VERSION_STORE, 'utf8');
    const reviewLogRulesSource = await readFile(REVIEW_LOG_RECORD_RULES, 'utf8');
    const reviewLogSource = await readFile(REVIEW_LOG_STORE, 'utf8');
    const rulesSource = await readFile(STREAM_RULES, 'utf8');

    expect(nodeVersionSource).toContain('FolioleCompanionSyncStreamQueryRules.nodeVersionsQueryName(context)');
    expect(nodeVersionSource).toContain('FolioleCompanionSyncStreamQueryRules.nodeVersionParentQueryName(context)');
    expect(reviewLogSource).toContain('FolioleCompanionSyncStreamQueryRules.reviewLogQueryName(context)');
    expect(reviewLogSource).toContain('FolioleCompanionSyncReviewLogRecordRules.string(context, queryName, record, key, fallback)');
    expect(reviewLogSource).toContain('FolioleCompanionSyncReviewLogRecordRules.key(context, queryName, key)');
    expect(reviewLogSource).toContain('FolioleCompanionSyncPayloadQueryStore.metadata(context');
    expect(reviewLogRulesSource).toContain('FolioleCompanionQueryDefinitionShapeKeys.queryKey(context, "columns")');
    expect(reviewLogRulesSource).toContain('FolioleCompanionQueryDefinitionShapeKeys.columnKey(context, "source")');
    expect(reviewLogRulesSource).not.toContain('column.getString("source")');
    expect(rulesSource).toContain('FolioleCompanionQueryAssetKeys.ruleGroup(context, "syncStreamRead", streamName)');
    expect(rulesSource).toContain('stringValue(context, streamName, "emptyCursorValue")');
    expect(rulesSource).toContain('intValue(context, streamName, "defaultLimit")');
    expect(nodeVersionSource).not.toContain('"syncNodeVersions"');
    expect(nodeVersionSource).not.toContain('"syncNodeVersionParent"');
    expect(reviewLogSource).not.toContain('"syncReviewLog"');
    expect(reviewLogRulesSource).toContain('FolioleCompanionQueryAssetKeys.key(context, "queries")');
    expect(reviewLogRulesSource).not.toContain('optJSONObject("queries")');
    expect(reviewLogRulesSource).not.toContain('getJSONArray("columns")');
    expect(reviewLogRulesSource).not.toContain('getString("source")');
    expect(rulesSource).not.toContain('group.getString("emptyCursorValue")');
    expect(rulesSource).not.toContain('group.getString("cursorCreatedAtKey")');
    expect(reviewLogSource).not.toContain('draft.getJSONObject("cardBefore")');
    expect(reviewLogSource).not.toContain('draft.getInt("grade")');
    expect(reviewLogSource).not.toContain('draft.optString("schedulerVersion"');
    expect(reviewLogSource).not.toContain('cardBefore.getString("due")');
    expect(reviewLogSource).not.toContain('record.put("op_id"');
    expect(reviewLogSource).not.toContain('record.optString("op_id"');
    expect(reviewLogSource).not.toContain('record.optInt("grade"');
    expect(`${nodeVersionSource}\n${reviewLogSource}`).not.toContain('Math.max(1, Math.min(1000');
  });
});
