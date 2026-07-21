import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { createBetterSqlite3Driver } from '../../electron/database/betterSqlite3Driver.ts';
import { buildDesktopSyncPackFromDriver } from '../../electron/database/syncPackBuilder.ts';
import { initializeDatabaseConnection } from '../../lib/core/database/migrations.ts';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');
const CREATED_AT = '2026-07-21T00:00:00.000Z';

export const IOS_CONTENT_RESOURCE_TOKENS = {
  external: 'external-orchid-token',
  pdf: 'pdf-cobalt-token',
  topic: 'topic-amber-token'
} as const;

export interface IosContentResourceAcceptanceFixture {
  attachments: Record<'corrupt' | 'failed' | 'missing' | 'valid', { bytes: Buffer; hash: string; id: string; mimeType: string }>;
  contentBlobs: Record<'corrupt' | 'external' | 'missing' | 'topic', { bytes: Buffer; hash: string; mimeType: string }>;
  packPath: string;
}

export async function createIosContentResourceAcceptanceFixture(args: {
  outputDirectory: string;
  toPeerId: string;
}): Promise<IosContentResourceAcceptanceFixture> {
  await fs.mkdir(args.outputDirectory, { recursive: true });
  const fixture = fixtureValues(args.outputDirectory);
  const sqlite = new BetterSqlite3(':memory:');
  const driver = createBetterSqlite3Driver(sqlite);
  initializeDatabaseConnection({ driver, sqlite });
  try {
    seedContentResourceRows(driver, fixture);
    await buildDesktopSyncPackFromDriver({
      createdAt: '2026-07-21T00:01:00.000Z',
      fromDeviceId: 'acceptance-desktop',
      fromStateSeq: 0,
      outputPath: fixture.packPath,
      packId: 'ios-content-resource-acceptance',
      toPeerId: args.toPeerId
    }, driver);
    return fixture;
  } finally {
    sqlite.close();
  }
}

function fixtureValues(outputDirectory: string): IosContentResourceAcceptanceFixture {
  const attachment = (kind: 'corrupt' | 'failed' | 'missing' | 'valid', bytes: Buffer) => ({
    bytes,
    hash: sha256(bytes),
    id: `ios-acceptance-${kind}-attachment`,
    mimeType: kind === 'valid' ? 'application/pdf' : 'image/png'
  });
  const content = (text: string) => {
    const bytes = Buffer.from(text, 'utf8');
    return { bytes, hash: sha256(bytes), mimeType: 'text/markdown' };
  };
  return {
    attachments: {
      corrupt: attachment('corrupt', Buffer.from('expected-corrupt-image')),
      failed: attachment('failed', Buffer.from('expected-failed-image')),
      missing: attachment('missing', Buffer.from('expected-missing-image')),
      valid: attachment('valid', Buffer.from(`%PDF-1.4\n${IOS_CONTENT_RESOURCE_TOKENS.pdf}\n%%EOF`))
    },
    contentBlobs: {
      corrupt: content('# Corrupt\n\nexpected corrupt body'),
      external: content(`# External\n\n${IOS_CONTENT_RESOURCE_TOKENS.external}`),
      missing: content('# Missing\n\nexpected missing body'),
      topic: content(`# Topic\n\n${IOS_CONTENT_RESOURCE_TOKENS.topic}`)
    },
    packPath: path.join(outputDirectory, 'content-resource.syncpack')
  };
}

function seedContentResourceRows(
  driver: ReturnType<typeof createBetterSqlite3Driver>,
  fixture: IosContentResourceAcceptanceFixture
) {
  seedContentBlob(driver, fixture.contentBlobs.topic.hash, fixture.contentBlobs.topic.bytes, 'topic');
  seedContentBlob(driver, fixture.contentBlobs.external.hash, fixture.contentBlobs.external.bytes, 'external');
  seedContentBlob(driver, fixture.contentBlobs.corrupt.hash, fixture.contentBlobs.corrupt.bytes, 'corrupt');
  seedContentBlob(driver, fixture.contentBlobs.missing.hash, fixture.contentBlobs.missing.bytes, 'missing');
  driver.execute(
    `INSERT INTO nodes (id, kind, title, content, body_blob_hash, opening_text, created_at, updated_at)
     VALUES ('ios-content-topic', 'topic', 'Content Topic', '', ?, 'Topic opening', ?, ?)`,
    [fixture.contentBlobs.topic.hash, CREATED_AT, CREATED_AT]
  );
  seedState(driver, 'node', 'ios-content-topic', 2);
  seedExternalDocument(driver, fixture.contentBlobs.external.hash);
  seedFailureNode(driver, 'ios-content-corrupt', fixture.contentBlobs.corrupt.hash, 4);
  seedFailureNode(driver, 'ios-content-missing', fixture.contentBlobs.missing.hash, 5);
  Object.values(fixture.attachments).forEach((attachment, index) => seedAttachment(driver, attachment, 6 + index));
  driver.execute(
    `INSERT INTO node_attachments (node_id, attachment_id, role)
     VALUES ('ios-content-topic', ?, 'reference')`,
    [fixture.attachments.valid.id]
  );
  driver.execute(
    `INSERT INTO pdf_page_text (attachment_id, page, text, page_width, page_height)
     VALUES (?, 1, ?, 800, 1200)`,
    [fixture.attachments.valid.id, `Extracted ${IOS_CONTENT_RESOURCE_TOKENS.pdf}`]
  );
  seedState(driver, 'pdf_page_text', `${fixture.attachments.valid.id}:1`, 10);
}

function seedFailureNode(
  driver: ReturnType<typeof createBetterSqlite3Driver>, id: string, bodyHash: string, stateSeq: number
) {
  driver.execute(
    `INSERT INTO nodes (id, kind, title, content, body_blob_hash, created_at, updated_at)
     VALUES (?, 'topic', ?, '', ?, ?, ?)`,
    [id, id, bodyHash, CREATED_AT, CREATED_AT]
  );
  seedState(driver, 'node', id, stateSeq);
}

function seedContentBlob(
  driver: ReturnType<typeof createBetterSqlite3Driver>, hash: string, bytes: Buffer, label: string
) {
  driver.execute(
    `INSERT INTO content_blobs (hash, storage_key, kind, mime_type, compression, original_size_bytes,
       stored_size_bytes, original_sha256, stored_sha256, availability, source_device_id, created_at)
     VALUES (?, ?, 'text_body', 'text/markdown', 'none', ?, ?, ?, ?, 'local', 'acceptance-desktop', ?)`,
    [hash, `content/${label}-${hash}`, bytes.length, bytes.length, hash, hash, CREATED_AT]
  );
  driver.execute('INSERT INTO content_blob_data (hash, data) VALUES (?, ?)', [hash, bytes]);
}

function seedExternalDocument(driver: ReturnType<typeof createBetterSqlite3Driver>, bodyHash: string) {
  driver.execute(
    `INSERT INTO external_documents (document_id, folder_id, relative_path, file_name, extension,
       source_size_bytes, source_modified_at, source_modified_ms, content_hash, title, opening_text,
       body_blob_hash, content, indexed_at, is_present, created_at, updated_at)
     VALUES ('ios-external:orchid.md', 'ios-external', 'orchid.md', 'orchid.md', 'md', 64, ?, 1,
       'external-content-hash', 'External Orchid', 'External opening', ?, '', ?, 1, ?, ?)`,
    [CREATED_AT, bodyHash, CREATED_AT, CREATED_AT, CREATED_AT]
  );
  seedState(driver, 'external_document', 'ios-external:orchid.md', 3);
}

function seedAttachment(
  driver: ReturnType<typeof createBetterSqlite3Driver>,
  attachment: IosContentResourceAcceptanceFixture['attachments']['valid'],
  stateSeq: number
) {
  driver.execute(
    `INSERT INTO attachments (id, original_name, mime_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?)`,
    [attachment.id, `${attachment.id}.bin`, attachment.mimeType, attachment.bytes.length, CREATED_AT]
  );
  driver.execute(
    `INSERT INTO attachment_blobs (attachment_id, content_hash, storage_key, size_bytes, mime_type,
       availability, source_device_id, created_at) VALUES (?, ?, ?, ?, ?, 'local', 'acceptance-desktop', ?)`,
    [attachment.id, attachment.hash, `attachments/${attachment.id}`, attachment.bytes.length, attachment.mimeType, CREATED_AT]
  );
  seedState(driver, 'attachment', attachment.id, stateSeq);
}

function seedState(
  driver: ReturnType<typeof createBetterSqlite3Driver>, objectType: string, objectId: string, stateSeq: number
) {
  driver.execute(
    `INSERT INTO sync_object_state (object_type, object_id, state_seq, content_hash,
       last_modified_by_device_id, updated_at, sync_dirty) VALUES (?, ?, ?, ?, 'acceptance-desktop', ?, 1)`,
    [objectType, objectId, stateSeq, `acceptance-${objectType}-${stateSeq}`, CREATED_AT]
  );
}

function sha256(bytes: Buffer) {
  return createHash('sha256').update(bytes).digest('hex');
}
