// @vitest-environment node
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const HOT_PATH_FILES = [
  'android/app/src/main/java/com/foliole/android/FolioleCompanionQueryAssetKeys.java',
  'android/app/src/main/java/com/foliole/android/FolioleCompanionMutationAssetKeys.java',
  'android/app/src/main/java/com/foliole/android/FolioleCompanionNamedQueryStore.java',
  'android/app/src/main/java/com/foliole/android/FolioleCompanionNamedMutationStore.java',
  'android/app/src/main/java/com/foliole/android/FolioleCompanionSyncPayloadQueryStore.java',
  'android/app/src/main/java/com/foliole/android/FolioleCompanionSyncReviewLogRecordRules.java'
];

describe('Android generated metadata hot paths', () => {
  it('loads query and mutation descriptor assets through the initialized JSON asset cache', async () => {
    for (const relativePath of HOT_PATH_FILES) {
      const source = await readFile(path.join(REPO_ROOT, relativePath), 'utf8');
      expect(source).toContain('FolioleCompanionJsonAssetCache.object(context');
      expect(source).not.toContain('new JSONObject(FolioleCompanionAssetReader.read(context');
    }
  });
});
