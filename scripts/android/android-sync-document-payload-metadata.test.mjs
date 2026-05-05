// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const QUERY_DEFINITIONS = path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'assets', 'companion-query-definitions.json');
const DOCUMENT_PAYLOAD = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionDocumentSyncPayload.java');
const DOCUMENT_RULES = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionDocumentPayloadRules.java');

describe('Android external document sync payload metadata', () => {
  it('generates external document payload keys and defaults', async () => {
    const definitions = JSON.parse(await readFile(QUERY_DEFINITIONS, 'utf8'));

    expect(definitions.queries.syncPayloadExternalDocument.syncPayload).toMatchObject({
      bodyBlobHashPayloadKey: 'body_blob_hash',
      contentHashPayloadKey: 'content_hash',
      defaultFilePart: '',
      defaultIsPresent: 1,
      defaultLong: 0,
      folderIdPayloadKey: 'folder_id',
      objectType: 'external_document',
      recordDeletedAtKey: 'deleted_at',
      recordUpdatedAtKey: 'updated_at',
      sourceSizeBytesPayloadKey: 'source_size_bytes'
    });
  });

  it('keeps Java document sync apply wired to generated payload metadata', async () => {
    const payloadSource = await readFile(DOCUMENT_PAYLOAD, 'utf8');
    const rulesSource = await readFile(DOCUMENT_RULES, 'utf8');

    expect(payloadSource).toContain('FolioleCompanionDocumentPayloadRules.contentHash(context, payload, record)');
    expect(payloadSource).toContain('FolioleCompanionDocumentPayloadRules.nullableString(context, payload');
    expect(rulesSource).toContain('FolioleCompanionSyncPayloadQueryStore.EXTERNAL_DOCUMENT_PAYLOAD_QUERY_NAME');
    expect(payloadSource).not.toContain('payload.optString("folder_id"');
    expect(payloadSource).not.toContain('payload.optString("content_hash"');
    expect(payloadSource).not.toContain('payload.optLong("source_size_bytes"');
    expect(payloadSource).not.toContain('record.optString("updated_at"');
    expect(payloadSource).not.toContain('record.isNull("deleted_at"');
  });
});
