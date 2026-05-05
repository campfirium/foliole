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
    const source = await readFile(SYNC_OBJECT_STORE, 'utf8');
    const loadSyncStateChangesBody = source.slice(
      source.indexOf('static JSObject loadSyncStateChanges'),
      source.indexOf('static JSObject applySyncObjects')
    );

    expect(loadSyncStateChangesBody).toContain("sync_dirty = 1");
    expect(loadSyncStateChangesBody).toContain("state_seq > ?");
  });

  it('marks remote-applied state rows clean', async () => {
    const source = await readFile(SYNC_OBJECT_STORE, 'utf8');
    const upsertStateBody = source.slice(
      source.indexOf('private static void upsertState'),
      source.indexOf('private static List<String> toStringList')
    );

    expect(upsertStateBody).toContain('record.optString("object_type")');
    expect(upsertStateBody).toContain('record.optString("object_id")');
    expect(upsertStateBody).toContain(',\n            0\n        );');
  });

  it('rejects node records from the Android generic state-object apply path', async () => {
    const source = await readFile(SYNC_OBJECT_STORE, 'utf8');
    const applyBody = source.slice(
      source.indexOf('static JSObject applySyncObjects'),
      source.indexOf('private static boolean shouldApplyObject')
    );

    expect(applyBody).toContain('isStateObjectType');
    expect(source).toContain('type.equals("view_state")');
    expect(source).not.toContain('type.equals("node")');
  });

  it('isolates Android remote object apply failures per record', async () => {
    const source = await readFile(SYNC_OBJECT_STORE, 'utf8');
    const applyBody = source.slice(
      source.indexOf('static JSObject applySyncObjects'),
      source.indexOf('private static boolean isStateObjectType')
    );
    const singleApplyBody = source.slice(
      source.indexOf('private static String applySingleSyncObject'),
      source.indexOf('private static boolean isStateObjectType')
    );

    expect(applyBody).toContain('try {');
    expect(applyBody).toContain('applySingleSyncObject');
    expect(applyBody).toContain('catch (Exception error)');
    expect(singleApplyBody).toContain('database.beginTransaction();');
    expect(singleApplyBody).toContain('database.setTransactionSuccessful();');
    expect(singleApplyBody).toContain('FolioleCompanionSyncObjectApply.applyPayload');
    expect(singleApplyBody).toContain('upsertState(database, object, deviceId)');
  });

  it('validates Android remote sync object envelope before apply', async () => {
    const source = await readFile(SYNC_OBJECT_STORE, 'utf8');
    const validationBody = source.slice(
      source.indexOf('private static void validateSyncObjectRecord'),
      source.indexOf('private static boolean isStateObjectType')
    );

    expect(validationBody).toContain('requireString(object, "object_type")');
    expect(validationBody).toContain('requireString(object, "object_id")');
    expect(validationBody).toContain('requireString(object, "content_hash")');
    expect(validationBody).toContain('requireString(object, "updated_at")');
    expect(validationBody).toContain('requireNullableString(object, "deleted_at")');
    expect(validationBody).toContain('requireNullableString(object, "payload_json")');
    expect(validationBody).toContain('Unsupported sync object type');
  });

  it('rejects unsupported Android payload types at the apply boundary', async () => {
    const source = await readFile(
      path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'foliole', 'android', 'FolioleCompanionSyncObjectApply.java'),
      'utf8'
    );

    expect(source).toContain('throw new IllegalArgumentException("Unsupported sync object type: " + type)');
  });

  it('marks local learning and setting writes dirty for push', async () => {
    const source = await readFile(SYNC_STATE_WRITE_STORE, 'utf8');
    const writeStateBody = source.slice(
      source.indexOf('private static void upsertTypedObjectState'),
      source.indexOf('private static JSONObject buildRecord')
    );

    expect(writeStateBody).toContain('FolioleCompanionNamedMutationStore.upsertSyncStateRow');
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
    expect(saveReviewBody).toContain('upsertTypedObjectState(database, "node_review"');
    expect(saveReviewBody).toContain('database.setTransactionSuccessful();');
  });

  it('marks local view-state writes dirty for push', async () => {
    const source = await readFile(VIEW_STATE_SYNC_STORE, 'utf8');
    const writeStateBody = source.slice(
      source.indexOf('private static void writeSyncRows'),
      source.indexOf('private static void upsertActiveNode')
    );

    expect(writeStateBody).toContain('FolioleCompanionNamedMutationStore.upsertSyncStateRow');
    expect(writeStateBody).toContain(', 1)');
  });

  it('keeps divergent Android node versions out of the current node row', async () => {
    const source = await readFile(NODE_VERSION_STORE, 'utf8');
    const applyBody = source.slice(
      source.indexOf('static JSObject applyNodeVersions'),
      source.indexOf('private static void upsertNode')
    );

    expect(applyBody).toContain('loadLocalVersionId');
    expect(applyBody).toContain('isFastForward');
    expect(applyBody).toContain('recordConflict');
    expect(applyBody).toContain('continue;');
  });

  it('exports Android node version ancestors for desktop fast-forward checks', async () => {
    const source = await readFile(NODE_VERSION_STORE, 'utf8');
    const loadBody = source.slice(
      source.indexOf('static JSObject loadNodeVersions'),
      source.indexOf('static JSObject applyNodeVersions')
    );

    expect(loadBody).toContain('listAncestorVersionIds(database, row.getString(0))');
    expect(source).toContain('private static JSONArray listAncestorVersionIds');
    expect(source).toContain('"parent_version_id"');
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

    expect(statusBody).toContain('normalized.equals("accepted")');
    expect(statusBody).toContain('normalized.equals("pending")');
  });
});
