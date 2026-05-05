// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ANDROID_COMPANION_SYNC_APPLY_MUTATION_RULES } from '../../lib/core/database/androidCompanionMutationDefinitions.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MUTATION_DEFINITIONS = path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'assets', 'companion-mutation-definitions.json');
const SYNC_APPLY_RULES = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionSyncApplyMutationRules.java');
const SYNC_APPLY_STORES = [
  'FolioleCompanionDocumentSyncPayload.java',
  'FolioleCompanionLearningSyncPayload.java',
  'FolioleCompanionSyncPushAckStore.java',
  'FolioleCompanionSyncReviewLogStore.java',
  'FolioleCompanionSyncStateWriteStore.java',
  'FolioleCompanionViewStateSyncStore.java'
].map((fileName) => path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android', fileName));

describe('Android sync apply mutation rules', () => {
  it('generates sync apply mutation metadata', async () => {
    const definitions = JSON.parse(await readFile(MUTATION_DEFINITIONS, 'utf8'));

    expect(definitions.syncApplyMutations).toEqual(ANDROID_COMPANION_SYNC_APPLY_MUTATION_RULES);
    expect(definitions.syncApplyMutations.groupKeys).toEqual({
      documents: 'documents',
      learning: 'learning',
      pushAck: 'pushAck',
      reviewLog: 'reviewLog',
      settings: 'settings',
      viewState: 'viewState'
    });
    expect(definitions.syncApplyMutations.learning).toMatchObject({
      readingDeleteMutationName: 'syncNodeReadingDelete',
      reviewUpsertMutationName: 'syncNodeReviewUpsert'
    });
    expect(definitions.syncApplyMutations.viewState).toMatchObject({
      activeNodeDeleteMutationName: 'syncViewActiveNodeDelete',
      nodeStateUpsertMutationName: 'syncViewNodeStateUpsert'
    });
  });

  it('keeps sync apply Java stores wired to generated mutation rules', async () => {
    const combinedStoreSource = (await Promise.all(SYNC_APPLY_STORES.map((file) => readFile(file, 'utf8')))).join('\n');
    const rulesSource = await readFile(SYNC_APPLY_RULES, 'utf8');

    expect(combinedStoreSource).toContain('FolioleCompanionSyncApplyMutationRules.string(context, "learning", key)');
    expect(combinedStoreSource).toContain('FolioleCompanionSyncApplyMutationRules.string(context, "viewState", key)');
    expect(combinedStoreSource).toContain('FolioleCompanionSyncApplyMutationRules.string(context, "settings", key)');
    expect(rulesSource).toContain('FolioleCompanionMutationAssetKeys.ruleGroup(context, "syncApplyMutations", groupName)');
    expect(rulesSource).not.toContain('optJSONObject("syncApplyMutations")');
    for (const mutationName of [
      'syncExternalDocumentMarkMissing',
      'syncExternalDocumentUpsert',
      'syncNodeReadingDelete',
      'syncNodeReadingDeviceStateDelete',
      'syncNodeReadingUpsert',
      'syncNodeReadingDeviceStateUpsert',
      'syncNodeReviewDelete',
      'syncNodeReviewUpsert',
      'syncPushAckDeleteIssuesByObject',
      'syncPushAckUpsert',
      'syncReviewLogInsert',
      'syncSettingRecordUpsert',
      'syncViewActiveNodeDelete',
      'syncViewActiveNodeUpsert',
      'syncViewNodeStateDelete',
      'syncViewNodeStateUpsert'
    ]) {
      expect(combinedStoreSource).not.toContain(`"${mutationName}"`);
    }
  });
});
