// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ANDROID_COMPANION_RESOURCE_READ_RULES } from '../../lib/core/database/androidCompanionResourceQueryDefinitions.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const QUERY_DEFINITIONS = path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'assets', 'companion-query-definitions.json');
const CONTENT_BLOB_STORE = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionContentBlobStore.java');
const CONTENT_BLOB_BATCH_STORE = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionContentBlobBatchStore.java');
const CONTENT_BLOB_BATCH_MANIFEST_STORE = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionContentBlobBatchManifestStore.java');
const CONTENT_BLOB_CAS_RULES = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionContentBlobCasRules.java');
const CONTENT_BLOB_MULTIPART_BATCH = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionContentBlobMultipartBatch.java');
const TEXT_BODY_BLOBS = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionTextBodyBlobs.java');
const WORKSPACE_SNAPSHOT_EXPORTER = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionWorkspaceSnapshotExporter.java');
const ATTACHMENT_RESOURCE_STORE = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionAttachmentResourceStore.java');
const ATTACHMENT_RESOURCE_BATCH_STORE = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionAttachmentResourceBatchStore.java');
const ATTACHMENT_RESOURCE_MISSING_STORE = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionAttachmentResourceMissingStore.java');
const APP_DATA_STORE = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionAppDataStore.java');
const PDF_PAGE_TEXT_STORE = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionPdfPageTextStore.java');
const RESOURCE_RULES = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionResourceReadQueryRules.java');

describe('Android resource read query rules', () => {
  it('generates content blob, attachment resource, and PDF text read metadata', async () => {
    const definitions = JSON.parse(await readFile(QUERY_DEFINITIONS, 'utf8'));

    expect(definitions.resourceRead).toEqual(ANDROID_COMPANION_RESOURCE_READ_RULES);
    expect(definitions.resourceRead.groupKeys).toEqual({
      attachmentResources: 'attachmentResources',
      contentBlobCas: 'contentBlobCas',
      contentBlobs: 'contentBlobs',
      pdfPageText: 'pdfPageText'
    });
    expect(definitions.resourceRead.contentBlobs).toMatchObject({
      batchResponseKeys: {
        syncedHashes: 'synced_hashes',
        totalElapsedMs: 'total_elapsed_ms'
      },
      dataTableName: 'content_blob_data',
      existingQueryName: 'contentBlobDataExisting',
      hashKey: 'hash',
      hashesReplacement: '__HASH_FILTER__',
      manifestTableName: 'content_blobs',
      manifestQueryName: 'contentBlobManifestByHash',
      manifestsByHashesQueryName: 'contentBlobManifestsByHashes',
      resultKey: 'blobs',
      syncResponseKeys: {
        availability: 'availability',
        hash: 'hash'
      }
    });
    expect(definitions.resourceRead.contentBlobCas).toMatchObject({
      hashAlgorithm: 'SHA-256',
      hashPattern: '^[a-f0-9]{64}$',
      manifestRules: {
        byteLengthEqualsOriginalSize: true,
        byteLengthEqualsStoredSize: true,
        hashEqualsOriginalSha256: true,
        hashEqualsStoredSha256: true
      },
      normalizeHashToLowercase: true,
      supportedCompression: 'none'
    });
    expect(definitions.resourceRead.attachmentResources).toMatchObject({
      batchResponseKeys: {
        syncedAttachmentIds: 'synced_attachment_ids'
      },
      directoryName: 'attachments',
      resolveResponseKeys: {
        resourceUrl: 'resource_url',
        status: 'status'
      },
      resolveQueryName: 'attachmentResourceResolve',
      resultKey: 'resources',
      syncRequestKeys: {
        attachmentId: 'attachment_id',
        contentHash: 'content_hash',
        url: 'url'
      },
      syncResponseKeys: {
        attachmentId: 'attachment_id',
        availability: 'availability'
      }
    });
    expect(definitions.resourceRead.pdfPageText).toMatchObject({
      defaultSearchLimit: 20,
      excerptRadius: 80,
      maxSearchLimit: 100,
      outputKeys: {
        excerpt: 'excerpt',
        matchStart: 'match_start',
        query: 'query'
      },
      pagesQueryName: 'pdfPageTextPages',
      searchQueryName: 'pdfPageTextSearch',
      searchResultKey: 'results'
    });
  });

  it('keeps resource Java stores wired to generated read rules', async () => {
    const combinedStoreSource = [
      await readFile(CONTENT_BLOB_STORE, 'utf8'),
      await readFile(CONTENT_BLOB_BATCH_STORE, 'utf8'),
      await readFile(CONTENT_BLOB_BATCH_MANIFEST_STORE, 'utf8'),
      await readFile(CONTENT_BLOB_CAS_RULES, 'utf8'),
      await readFile(CONTENT_BLOB_MULTIPART_BATCH, 'utf8'),
      await readFile(TEXT_BODY_BLOBS, 'utf8'),
      await readFile(WORKSPACE_SNAPSHOT_EXPORTER, 'utf8'),
      await readFile(ATTACHMENT_RESOURCE_STORE, 'utf8'),
      await readFile(ATTACHMENT_RESOURCE_BATCH_STORE, 'utf8'),
      await readFile(ATTACHMENT_RESOURCE_MISSING_STORE, 'utf8'),
      await readFile(APP_DATA_STORE, 'utf8'),
      await readFile(PDF_PAGE_TEXT_STORE, 'utf8')
    ].join('\n');
    const casControlledSource = [
      await readFile(CONTENT_BLOB_STORE, 'utf8'),
      await readFile(CONTENT_BLOB_BATCH_STORE, 'utf8'),
      await readFile(CONTENT_BLOB_BATCH_MANIFEST_STORE, 'utf8'),
      await readFile(CONTENT_BLOB_CAS_RULES, 'utf8'),
      await readFile(CONTENT_BLOB_MULTIPART_BATCH, 'utf8')
    ].join('\n');
    const rulesSource = await readFile(RESOURCE_RULES, 'utf8');

    expect(combinedStoreSource).toContain('FolioleCompanionResourceReadQueryRules.contentBlobString(context, key)');
    expect(combinedStoreSource).toContain('FolioleCompanionResourceReadQueryRules.contentBlobRowLong(context, row, key)');
    expect(combinedStoreSource).toContain('FolioleCompanionResourceReadQueryRules.contentBlobRowString(context, row, key)');
    expect(combinedStoreSource).toContain('FolioleCompanionResourceReadQueryRules.contentBlobBatchResponseKey(context, key)');
    expect(combinedStoreSource).toContain('FolioleCompanionResourceReadQueryRules.contentBlobSyncResponseKey(context, key)');
    expect(combinedStoreSource).toContain('FolioleCompanionResourceReadQueryRules.contentBlobCasString(context, key)');
    expect(combinedStoreSource).toContain('FolioleCompanionResourceReadQueryRules.contentBlobCasBoolean(context, "manifestRules", key)');
    expect(combinedStoreSource).toContain('FolioleCompanionResourceReadQueryRules.attachmentString(context, key)');
    expect(combinedStoreSource).toContain('FolioleCompanionResourceReadQueryRules.attachmentBatchResponseKey(context, key)');
    expect(combinedStoreSource).toContain('FolioleCompanionResourceReadQueryRules.attachmentResolveResponseKey(context, key)');
    expect(combinedStoreSource).toContain('FolioleCompanionResourceReadQueryRules.attachmentSyncResponseKey(context, key)');
    expect(combinedStoreSource).toContain('FolioleCompanionResourceReadQueryRules.pdfPageTextString(context, key)');
    expect(combinedStoreSource).toContain('FolioleCompanionResourceReadQueryRules.pdfPageTextInt(context, key)');
    expect(combinedStoreSource).toContain('FolioleCompanionResourceReadQueryRules.pdfPageTextOutputKey(context, key)');
    expect(combinedStoreSource).toContain('FolioleCompanionResourceReadQueryRules.pdfPageTextArray(context, key)');
    expect(combinedStoreSource).toContain('FolioleCompanionQueryDefinitionShapeKeys.fieldRowDoubleOrDefault(context, row, field, 0)');
    expect(combinedStoreSource).toContain('FolioleCompanionQueryDefinitionShapeKeys.fieldRowLong(context, row, field)');
    expect(combinedStoreSource).toContain('FolioleCompanionQueryDefinitionShapeKeys.fieldRowString(context, row, field)');
    expect(rulesSource).toContain('FolioleCompanionQueryAssetKeys.ruleGroup(context, "resourceRead", groupName)');
    expect(rulesSource).toContain('getJSONObject(key)');
    expect(combinedStoreSource).not.toContain('"contentBlobManifestByHash"');
    expect(combinedStoreSource).not.toContain('"contentBlobManifestsByHashes"');
    expect(combinedStoreSource).not.toContain('"contentBlobDataExisting"');
    expect(combinedStoreSource).not.toContain('"__HASH_FILTER__"');
    expect(combinedStoreSource).not.toContain('"attachmentResourceResolve"');
    expect(combinedStoreSource).not.toContain('"attachments"');
    expect(combinedStoreSource).not.toContain('"content_blob_data"');
    expect(combinedStoreSource).not.toContain('"content_blobs"');
    expect(combinedStoreSource).not.toContain('"pdfPageTextPages"');
    expect(combinedStoreSource).not.toContain('"pdfPageTextSearch"');
    expect(combinedStoreSource).not.toContain('put("synced_attachment_ids"');
    expect(combinedStoreSource).not.toContain('put("synced_hashes"');
    expect(combinedStoreSource).not.toContain('put("resource_url"');
    expect(combinedStoreSource).not.toContain('put("availability"');
    expect(combinedStoreSource).not.toContain('put("query"');
    expect(combinedStoreSource).not.toContain('put("match_start"');
    expect(combinedStoreSource).not.toContain('put("excerpt"');
    expect(combinedStoreSource).not.toContain('optString("attachment_id"');
    expect(combinedStoreSource).not.toContain('optString("content_hash"');
    expect(combinedStoreSource).not.toContain('row.getString(resourceRule(context, "hashKey"))');
    expect(combinedStoreSource).not.toContain('blob.getString(resourceRule(context, "compressionKey"))');
    expect(combinedStoreSource).not.toContain('blob.getLong(resourceRule(context, "originalSizeBytesKey"))');
    expect(combinedStoreSource).not.toContain('row.getString(resourceRule(context, "attachmentIdKey"))');
    expect(combinedStoreSource).not.toContain('row.getString(resourceRule(context, "contentHashKey"))');
    expect(casControlledSource).not.toContain('MessageDigest.getInstance("SHA-256")');
    expect(casControlledSource).not.toContain('matches("[a-f0-9]{64}")');
    expect(casControlledSource).not.toContain('"none".equals(compression)');
    expect(combinedStoreSource).not.toContain('DEFAULT_SEARCH_LIMIT');
    expect(combinedStoreSource).not.toContain('EXCERPT_RADIUS');
  });
});
