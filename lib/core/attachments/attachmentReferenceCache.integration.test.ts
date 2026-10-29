// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { ATTACHMENT_DEMAND_SCHEMA } from '../database/attachmentDemandSchema.js';
import { migrateAttachmentReferenceCache } from '../database/attachmentReferenceCacheSchema.js';
import { DESKTOP_CORE_SCHEMA_STATEMENTS } from '../database/desktopCoreSchemaStatements.js';
import { hashTextBody } from '../database/textBodyHash.js';

import { readAttachmentReferenceInputs, saveAttachmentReferenceResults, readCompleteAttachmentReferenceKeys,
  requeueMissingObservedAttachments } from './attachmentReferenceCache.js';
import { parseAttachmentReferenceInput } from './attachmentReferenceInputs.js';

const image = `${'a'.repeat(64)}.png`;
const pdf = `${'b'.repeat(64)}.pdf`;
const body = `![image](asset://${image})`;
function fixture() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(DESKTOP_CORE_SCHEMA_STATEMENTS.find(sql => sql.startsWith('CREATE TABLE IF NOT EXISTS nodes ('))!);
  for (const sql of ATTACHMENT_DEMAND_SCHEMA) sqlite.exec(sql);
  sqlite.exec('CREATE TABLE framed_sync_resource_availability(hash TEXT PRIMARY KEY, available INTEGER)');
  migrateAttachmentReferenceCache(sqlite);
  const db = createBetterSqliteDbPort(sqlite);
  const insert = (id: string, text = body) => sqlite.prepare(`INSERT INTO nodes
    (id,title,content,body_blob_hash,created_at,updated_at) VALUES (?,? ,?,?, '2000','2000')`)
    .run(id, id, text, hashTextBody(text));
  const scan = async () => {
    const inputs = await db.transaction(tx => readAttachmentReferenceInputs(tx, null));
    await saveAttachmentReferenceResults(db, inputs.map(parseAttachmentReferenceInput));
    return inputs.map(row => row.id);
  };
  return { sqlite, db, insert, scan };
}

it('reuses unchanged and empty nodes, replaces changed bodies and mounts, and keeps shared references', async () => {
  const f = fixture();
  try {
    f.insert('a'); f.insert('b');
    f.sqlite.prepare("INSERT INTO nodes(id,title,content,created_at,updated_at) VALUES ('empty','Empty','','2000','2000')").run();
    expect(await f.scan()).toEqual(['a', 'b', 'empty']);
    expect(await f.scan()).toEqual([]);
    expect(await readCompleteAttachmentReferenceKeys(f.db)).toEqual([image]);
    f.sqlite.prepare("UPDATE nodes SET content='', body_blob_hash=? WHERE id='a'").run(hashTextBody(''));
    expect(await f.scan()).toEqual(['a']);
    expect(await readCompleteAttachmentReferenceKeys(f.db)).toEqual([image]);
    f.sqlite.prepare("UPDATE nodes SET content='', body_blob_hash=?, resource_references=? WHERE id='b'")
      .run(hashTextBody(''), JSON.stringify([{ storage_key: pdf, role: 'reference', original_name: null }]));
    expect(await f.scan()).toEqual(['b']);
    expect(await readCompleteAttachmentReferenceKeys(f.db)).toEqual([pdf]);
    f.sqlite.exec("UPDATE nodes SET deleted_at='now' WHERE id='b'");
    expect(await f.scan()).toEqual([]);
    expect(await readCompleteAttachmentReferenceKeys(f.db)).toEqual([pdf]);
    f.sqlite.exec("DELETE FROM nodes WHERE id='b'");
    expect(await readCompleteAttachmentReferenceKeys(f.db)).toEqual([]);
  } finally { f.sqlite.close(); }
});

it('rejects stale results and cannot resurrect physically removed nodes', async () => {
  const f = fixture();
  try {
    f.insert('a'); f.insert('b');
    const stale = (await readAttachmentReferenceInputs(f.db, null)).map(parseAttachmentReferenceInput);
    f.sqlite.exec("UPDATE nodes SET content='', body_blob_hash=NULL WHERE id='a'; DELETE FROM nodes WHERE id='b'");
    expect(await saveAttachmentReferenceResults(f.db, stale)).toBe(0);
    expect(await readCompleteAttachmentReferenceKeys(f.db)).toBeNull();
    expect(await f.scan()).toEqual(['a']);
    expect(await readCompleteAttachmentReferenceKeys(f.db)).toEqual([]);
  } finally { f.sqlite.close(); }
});

it('keeps unknown inputs incomplete and enqueues missing references without reading any bodies', async () => {
  const f = fixture();
  try {
    f.insert('live'); f.insert('trash');
    await f.scan();
    f.sqlite.exec("UPDATE nodes SET deleted_at='now' WHERE id='trash'; DELETE FROM attachment_parse_queue");
    const contentBefore = f.sqlite.prepare('SELECT id,content FROM nodes ORDER BY id').all();
    await f.db.transaction(tx => requeueMissingObservedAttachments(tx, [image]));
    expect(f.sqlite.prepare('SELECT article_id FROM attachment_parse_queue').pluck().all()).toEqual(['live']);
    expect(f.sqlite.prepare('SELECT available FROM framed_sync_resource_availability').pluck().get()).toBe(0);
    expect(f.sqlite.prepare('SELECT id,content FROM nodes ORDER BY id').all()).toEqual(contentBefore);
    f.sqlite.exec("UPDATE nodes SET body_blob_hash=NULL WHERE id='live'");
    expect(await readCompleteAttachmentReferenceKeys(f.db)).toBeNull();
    await expect(f.scan()).rejects.toThrow('attachment_scan_body_unreadable');
  } finally { f.sqlite.close(); }
});

it('bounds changed body batches by bytes without splitting one node', async () => {
  const f = fixture();
  try {
    f.insert('a', body.repeat(100)); f.insert('b', body);
    const first = await readAttachmentReferenceInputs(f.db, null, 128, 100);
    expect(first.map(row => row.id)).toEqual(['a']);
    expect((await readAttachmentReferenceInputs(f.db, 'a', 128, 100)).map(row => row.id)).toEqual(['b']);
    expect(() => parseAttachmentReferenceInput({ ...first[0]!, content: 'wrong' })).toThrow('hash_mismatch');
  } finally { f.sqlite.close(); }
});
