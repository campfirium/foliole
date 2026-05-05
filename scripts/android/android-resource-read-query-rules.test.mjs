// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ANDROID_COMPANION_CONTENT_READ_RULES,
  ANDROID_COMPANION_RESOURCE_READ_RULES
} from '../../lib/core/database/androidCompanionResourceQueryDefinitions.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const QUERY_DEFINITIONS = path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'assets', 'companion-query-definitions.json');
const CONTENT_BLOB_STORE = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionContentBlobStore.java');
const CONTENT_BLOB_BATCH_MANIFEST_STORE = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionContentBlobBatchManifestStore.java');
const TEXT_BODY_BLOBS = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionTextBodyBlobs.java');
const WORKSPACE_SNAPSHOT_EXPORTER = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionWorkspaceSnapshotExporter.java');
const ATTACHMENT_RESOURCE_STORE = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionAttachmentResourceStore.java');
const ATTACHMENT_RESOURCE_BATCH_STORE = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionAttachmentResourceBatchStore.java');
const ATTACHMENT_RESOURCE_MISSING_STORE = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionAttachmentResourceMissingStore.java');
const APP_DATA_STORE = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionAppDataStore.java');
const PDF_PAGE_TEXT_STORE = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionPdfPageTextStore.java');
const RESOURCE_RULES = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionResourceReadQueryRules.java');
const READABLE_ARTICLE_QUERY = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionReadableArticleQuery.java');
const EXTERNAL_DOCUMENT_STORE = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionExternalDocumentStore.java');

describe('Android resource read query rules', () => {
  it('generates content blob, attachment resource, and PDF text read metadata', async () => {
    const definitions = JSON.parse(await readFile(QUERY_DEFINITIONS, 'utf8'));

    expect(definitions.resourceRead).toEqual(ANDROID_COMPANION_RESOURCE_READ_RULES);
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
    expect(definitions.contentRead.readableArticle).toMatchObject({
      rowKeys: {
        bodyBlobHash: 'body_blob_hash',
        id: 'id'
      },
      outputKeys: {
        contentStatus: 'content_status',
        nodeId: 'node_id'
      }
    });
    expect(definitions.contentRead.externalDocuments).toMatchObject({
      outputKeys: {
        document: 'document',
        matchStart: 'match_start',
        results: 'results'
      },
      rowKeys: {
        bodyBlobData: 'body_blob_data',
        documentId: 'document_id',
        matchIndex: 'match_index'
      }
    });
    expect(definitions.contentRead).toEqual(ANDROID_COMPANION_CONTENT_READ_RULES);
  });

  it('keeps resource Java stores wired to generated read rules', async () => {
    const combinedStoreSource = [
      await readFile(CONTENT_BLOB_STORE, 'utf8'),
      await readFile(CONTENT_BLOB_BATCH_MANIFEST_STORE, 'utf8'),
      await readFile(TEXT_BODY_BLOBS, 'utf8'),
      await readFile(WORKSPACE_SNAPSHOT_EXPORTER, 'utf8'),
      await readFile(ATTACHMENT_RESOURCE_STORE, 'utf8'),
      await readFile(ATTACHMENT_RESOURCE_BATCH_STORE, 'utf8'),
      await readFile(ATTACHMENT_RESOURCE_MISSING_STORE, 'utf8'),
      await readFile(APP_DATA_STORE, 'utf8'),
      await readFile(PDF_PAGE_TEXT_STORE, 'utf8')
    ].join('\n');
    const rulesSource = await readFile(RESOURCE_RULES, 'utf8');

    expect(combinedStoreSource).toContain('FolioleCompanionResourceReadQueryRules.contentBlobString(context, key)');
    expect(combinedStoreSource).toContain('FolioleCompanionResourceReadQueryRules.contentBlobObject(context, key)');
    expect(combinedStoreSource).toContain('FolioleCompanionResourceReadQueryRules.attachmentString(context, key)');
    expect(combinedStoreSource).toContain('FolioleCompanionResourceReadQueryRules.attachmentObject(context, key)');
    expect(combinedStoreSource).toContain('FolioleCompanionResourceReadQueryRules.pdfPageTextString(context, key)');
    expect(combinedStoreSource).toContain('FolioleCompanionResourceReadQueryRules.pdfPageTextObject(context, "outputKeys")');
    expect(rulesSource).toContain('FolioleCompanionQueryAssetKeys.section(context, "resourceRead")');
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
    expect(combinedStoreSource).not.toContain('DEFAULT_SEARCH_LIMIT');
    expect(combinedStoreSource).not.toContain('EXCERPT_RADIUS');
  });

  it('keeps readable article Java shape wired to generated content rules', async () => {
    const source = await readFile(READABLE_ARTICLE_QUERY, 'utf8');

    expect(source).toContain('FolioleCompanionContentReadQueryRules.readableArticleObject(context, key)');
    expect(source).toContain('FolioleCompanionResourceReadQueryRules.pdfPageTextString(context, "textKey")');
    expect(source).not.toContain('article.put("node_id"');
    expect(source).not.toContain('article.put("content_status"');
    expect(source).not.toContain('row.getString("id"');
    expect(source).not.toContain('optString("text"');
  });

  it('keeps external document Java shape wired to generated content rules', async () => {
    const source = await readFile(EXTERNAL_DOCUMENT_STORE, 'utf8');

    expect(source).toContain('FolioleCompanionContentReadQueryRules.externalDocumentObject(context, key)');
    expect(source).toContain('FolioleCompanionContentReadQueryRules.externalDocumentArray(context, key)');
    expect(source).not.toContain('result.put("document"');
    expect(source).not.toContain('entry.put("document_id"');
    expect(source).not.toContain('target.put("content_status"');
    expect(source).not.toContain('row.getString("document_id"');
    expect(source).not.toContain('row.getInt("match_index"');
  });
});
