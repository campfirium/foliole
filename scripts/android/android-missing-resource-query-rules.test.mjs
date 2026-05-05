// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ANDROID_COMPANION_MISSING_RESOURCE_READ_RULES } from '../../lib/core/database/androidCompanionResourceQueryDefinitions.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const QUERY_DEFINITIONS = path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'assets', 'companion-query-definitions.json');
const ATTACHMENT_MISSING_STORE = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionAttachmentResourceMissingStore.java');
const CONTENT_MISSING_STORE = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionContentBlobMissingStore.java');
const MISSING_RULES = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionMissingResourceQueryRules.java');

describe('Android missing resource query rules', () => {
  it('generates missing resource read metadata', async () => {
    const definitions = JSON.parse(await readFile(QUERY_DEFINITIONS, 'utf8'));

    expect(definitions.missingResourceRead).toEqual(ANDROID_COMPANION_MISSING_RESOURCE_READ_RULES);
    expect(definitions.missingResourceRead.groupKeys).toEqual({
      attachmentResources: 'attachmentResources',
      contentBlobs: 'contentBlobs'
    });
    expect(definitions.missingResourceRead.attachmentResources).toMatchObject({
      byIdQueryName: 'attachmentResourceMissingById',
      minLimit: 1,
      resultKey: 'resources',
      rowsQueryName: 'attachmentResourceMissingRows',
      rowKeys: {
        attachmentId: 'attachment_id',
        availability: 'availability',
        storageKey: 'storage_key'
      },
      summaryKeys: {
        count: 'missing_attachment_resource_count',
        failedCount: 'failed_attachment_resource_count'
      },
      summaryQueryName: 'attachmentResourceMissingSummaryRows'
    });
    expect(definitions.missingResourceRead.contentBlobs).toMatchObject({
      hashesQueryName: 'contentBlobMissingHashes',
      minLimit: 1,
      resultKey: 'blobs',
      rowKeys: {
        availability: 'availability',
        sizeBytes: 'size_bytes'
      },
      summaryKeys: {
        count: 'missing_content_blob_count',
        failedCount: 'failed_content_blob_count'
      },
      summaryQueryName: 'contentBlobMissingSummaryRows'
    });
  });

  it('keeps missing resource Java stores wired to generated query rules', async () => {
    const combinedStoreSource = `${await readFile(ATTACHMENT_MISSING_STORE, 'utf8')}\n${await readFile(CONTENT_MISSING_STORE, 'utf8')}`;
    const rulesSource = await readFile(MISSING_RULES, 'utf8');

    expect(combinedStoreSource).toContain('FolioleCompanionMissingResourceQueryRules.attachmentRowsQueryName(context)');
    expect(combinedStoreSource).toContain('FolioleCompanionMissingResourceQueryRules.contentHashesQueryName(context)');
    expect(combinedStoreSource).toContain('FolioleCompanionQueryDefinitionShapeKeys.fieldKey(context, key)');
    expect(combinedStoreSource).toContain('FolioleCompanionQueryDefinitionShapeKeys.fieldType(context, key)');
    expect(rulesSource).toContain('FolioleCompanionQueryAssetKeys.ruleGroup(context, "missingResourceRead", groupName)');
    expect(combinedStoreSource).not.toContain('field.getString("outputKey")');
    expect(combinedStoreSource).not.toContain('field.getString("rowKey")');
    expect(combinedStoreSource).not.toContain('field.getString("type")');
    expect(combinedStoreSource).not.toContain('"attachmentResourceMissingRows"');
    expect(combinedStoreSource).not.toContain('"contentBlobMissingHashes"');
    expect(combinedStoreSource).not.toContain('"missing_attachment_resource_count"');
    expect(combinedStoreSource).not.toContain('"missing_content_blob_count"');
    expect(combinedStoreSource).not.toContain('"size_bytes"');
    expect(combinedStoreSource).not.toContain('"storage_key"');
    expect(combinedStoreSource).not.toContain('Math.max(1, limit)');
  });
});
