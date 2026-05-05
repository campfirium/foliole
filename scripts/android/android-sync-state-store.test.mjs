// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SYNC_OBJECT_STORE = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'foliole',
  'android',
  'FolioleCompanionSyncObjectStore.java'
);
const SYNC_STATE_WRITE_STORE = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'foliole',
  'android',
  'FolioleCompanionSyncStateWriteStore.java'
);
const SYNC_PAYLOAD_QUERY_STORE = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'foliole',
  'android',
  'FolioleCompanionSyncPayloadQueryStore.java'
);
const SYNC_OBJECT_QUERY_RULES = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'foliole',
  'android',
  'FolioleCompanionSyncObjectQueryRules.java'
);
const VIEW_STATE_SYNC_STORE = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'foliole',
  'android',
  'FolioleCompanionViewStateSyncStore.java'
);
const NODE_VERSION_STORE = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'foliole',
  'android',
  'FolioleCompanionSyncNodeVersionStore.java'
);
const COMPANION_SCHEMA = path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'assets', 'companion-core-schema.json');
const COMPANION_QUERY_DEFINITIONS = path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'assets', 'companion-query-definitions.json');
const SYNC_META_STORE = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'foliole',
  'android',
  'FolioleCompanionSyncMetaStore.java'
);

describe('FolioleCompanionSyncObjectStore', () => {
  it('loads only dirty state rows for Android push', async () => {
    const source = JSON.parse(await readFile(COMPANION_QUERY_DEFINITIONS, 'utf8'));
    const sql = source.queries.syncStateChanges.sql;

    expect(sql).toContain("sync_dirty = 1");
    expect(sql).toContain("state_seq > ?");
  });

  it('loads sync object indexes and payloads through generated queries', async () => {
    const source = await readFile(SYNC_OBJECT_STORE, 'utf8');
    const rulesSource = await readFile(SYNC_OBJECT_QUERY_RULES, 'utf8');
    const syncPayloadQueryStore = await readFile(SYNC_PAYLOAD_QUERY_STORE, 'utf8');
    const queryDefinitions = JSON.parse(await readFile(COMPANION_QUERY_DEFINITIONS, 'utf8'));
    const loadBody = source.slice(
      source.indexOf('static JSObject loadSyncObjects'),
      source.indexOf('private static Map')
    );

    expect(source).toContain('FolioleCompanionSyncObjectQueryRules.syncIndexQueryName(context)');
    expect(source).toContain('FolioleCompanionSyncPayloadQueryStore.loadRowsWithPayloads');
    expect(loadBody).toContain('FolioleCompanionSyncObjectQueryRules.syncObjectsQueryName(context)');
    expect(loadBody).toContain('FolioleCompanionSyncObjectQueryRules.syncObjectsReplacements(context');
    expect(rulesSource).toContain('FolioleCompanionQueryAssetKeys.ruleGroup(context, "syncObjectRead", groupName)');
    expect(source).not.toContain('objectTypeFilter');
    expect(source).not.toContain('private static void appendPayloads');
    expect(queryDefinitions.queries.syncObjects.sql).toContain('? = 0 OR object_type IN (:objectTypes)');
    expect(queryDefinitions.syncPayloadRouting.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          objectIdKey: 'active_node',
          objectType: 'view_state',
          queryName: 'syncPayloadViewActiveNode'
        }),
        expect.objectContaining({
          objectIdPrefix: 'node:',
          objectType: 'view_state',
          queryName: 'syncPayloadViewNodeState'
        })
      ])
    );
    expect(syncPayloadQueryStore).toContain('static JSObject loadRowsWithPayloads');
    expect(syncPayloadQueryStore).toContain('? loadPayload(');
    expect(queryDefinitions.queries.syncPayloadAttachment.syncPayload).toEqual({
      argMode: 'object_id',
      objectType: 'attachment'
    });
    expect(syncPayloadQueryStore).toContain('private static String loadPayload');
    expect(syncPayloadQueryStore).toContain('private static JSONObject syncPayloadRoute');
    expect(syncPayloadQueryStore).toContain('private static String[] queryArgs');
    await expect(readFile(
      path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'foliole', 'android', 'FolioleCompanionSyncObjectPayloadReader.java'),
      'utf8'
    )).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps removed Android state apply forks out of the sync store', async () => {
    const removedFiles = [
      'FolioleCompanionSyncConflictStore.java',
      'FolioleCompanionSyncObjectApply.java',
      'FolioleCompanionSyncStateRows.java'
    ];

    await Promise.all(
      removedFiles.map((fileName) =>
        expect(
          readFile(
            path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'foliole', 'android', fileName),
            'utf8'
          )
        ).rejects.toMatchObject({ code: 'ENOENT' })
      )
    );
  });

  it('marks local learning and setting writes dirty for push', async () => {
    const source = await readFile(SYNC_STATE_WRITE_STORE, 'utf8');
    const writeStateBody = source.slice(
      source.indexOf('private static void upsertTypedObjectState'),
      source.indexOf('private static JSONObject buildRecord')
    );

    expect(writeStateBody).toContain('FolioleCompanionGeneratedMutationRunner.upsertSyncStateRow');
    expect(writeStateBody).toContain(', 1)');
  });

  it('writes fsrs review log and node_review state in one Android transaction', async () => {
    const source = await readFile(SYNC_STATE_WRITE_STORE, 'utf8');
    const saveReviewBody = source.slice(
      source.indexOf('static JSObject saveNodeReview'),
      source.indexOf('private static void upsertSettingRecord')
    );

    expect(saveReviewBody).toContain('database.beginTransaction();');
    expect(saveReviewBody).toContain('FolioleCompanionLearningSyncPayload.applyReview');
    expect(saveReviewBody).toContain('FolioleCompanionSyncReviewLogStore.saveLocalReviewLog');
    expect(saveReviewBody).toContain('String objectType = syncObjectType(context, "nodeReview");');
    expect(saveReviewBody).toContain('upsertTypedObjectState(context, database, objectType');
    expect(saveReviewBody).toContain('database.setTransactionSuccessful();');
  });

  it('marks local view-state writes dirty for push', async () => {
    const source = await readFile(VIEW_STATE_SYNC_STORE, 'utf8');
    const writeStateBody = source.slice(
      source.indexOf('private static void writeSyncRows'),
      source.indexOf('private static void upsertActiveNode')
    );

    expect(writeStateBody).toContain('FolioleCompanionGeneratedMutationRunner.upsertSyncStateRow');
    expect(writeStateBody).toContain(', 1)');
  });

  it('exports Android node version ancestors for desktop fast-forward checks', async () => {
    const source = await readFile(NODE_VERSION_STORE, 'utf8');
    const queryDefinitions = await readFile(COMPANION_QUERY_DEFINITIONS, 'utf8');
    const loadBody = source.slice(
      source.indexOf('static JSObject loadNodeVersions'),
      source.indexOf('private static JSONArray listAncestorVersionIds')
    );

    expect(loadBody).toContain('FolioleCompanionGeneratedQueryRunner.load');
    expect(loadBody).toContain('FolioleCompanionSyncStreamQueryRules.nodeVersionIdKey(context)');
    expect(source).toContain('private static JSONArray listAncestorVersionIds');
    expect(queryDefinitions).toContain('"syncNodeVersionParent"');
    expect(queryDefinitions).toContain('parent_version_id');
  });

  it('installs the Android node conflict table in the fresh companion schema', async () => {
    const schema = await readFile(COMPANION_SCHEMA, 'utf8');

    expect(schema).toContain('CREATE TABLE IF NOT EXISTS node_sync_conflicts');
    expect(schema).toContain('idx_node_sync_conflicts_object_detected');
  });

  it('keeps accepted onboarding state on Android after the user starts setup', async () => {
    const source = await readFile(SYNC_META_STORE, 'utf8');
    const statusBody = source.slice(
      source.indexOf('private static boolean isValidSyncOnboardingStatus'),
      source.indexOf('private static void saveRememberedTargets')
    );

    expect(statusBody).toContain('syncOnboardingStatuses(context).contains(normalized)');
    expect(statusBody).toContain('FolioleCompanionSyncProtocolDefinitions.stringSet(context, "syncOnboarding", "statuses")');
  });
});
