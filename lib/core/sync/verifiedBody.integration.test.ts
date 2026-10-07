// @vitest-environment node

import { createHash } from 'node:crypto';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { BODY_CONTENT_CHUNK_BYTES, BODY_CONTENT_SCHEMA } from '../database/bodyContentSchema.js';
import { DESKTOP_RESOURCE_SCHEMA_STATEMENTS } from '../database/desktopResourceSchemaStatements.js';

import { adoptVerifiedBody, stageBodyContent } from './bodyContentWrite.js';
import { loadVerifiedBodyRef, readBodyRange, readBodyText, verifyBodyContent } from './verifiedBody.js';

function open() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  for (const sql of BODY_CONTENT_SCHEMA) sqlite.exec(sql);
  sqlite.exec(DESKTOP_RESOURCE_SCHEMA_STATEMENTS.find((sql) => sql.includes('CREATE TABLE IF NOT EXISTS content_blobs'))!);
  return { sqlite, db: createBetterSqliteDbPort(sqlite) };
}

const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');

async function* chunks(data: Uint8Array) {
  for (let offset = 0; offset < data.byteLength; offset += BODY_CONTENT_CHUNK_BYTES) {
    yield data.subarray(offset, offset + BODY_CONTENT_CHUNK_BYTES);
  }
}

it.each([
  'x'.repeat(3 * 1024 * 1024),
  'line\r\n'.repeat(3 * 1024 * 1024 / 6),
  '中😀'.repeat(Math.floor(3 * 1024 * 1024 / 7)) + 'abcde'
])('preserves a 3 MiB body, including UTF-8 and CRLF crossing block boundaries', async (text) => {
  const { sqlite, db } = open();
  try {
    const data = Buffer.from(text);
    expect(data.byteLength).toBe(3 * 1024 * 1024);
    const ref = await db.transaction((tx) => stageBodyContent(tx, {
      hash: hash(data), byteLength: data.byteLength, chunks: chunks(data)
    }));
    await db.transaction((tx) => adoptVerifiedBody(tx, ref, '2026-10-07T00:00:00.000Z'));
    expect(await readBodyText(db, ref)).toBe(text);
    expect(ref.utf16Length).toBe(text.length);
    const range = await readBodyRange(db, ref, BODY_CONTENT_CHUNK_BYTES - 3, 10);
    expect(Buffer.from(range)).toEqual(data.subarray(BODY_CONTENT_CHUNK_BYTES - 3, BODY_CONTENT_CHUNK_BYTES + 7));
    await expect(db.run('UPDATE content_body_chunks SET data = ? WHERE hash = ? AND byte_offset = 0',
      [Buffer.of(0), ref.hash])).rejects.toThrow('body_content_immutable');
    expect(sqlite.prepare('SELECT count(*) AS count FROM content_body_chunks').get()).toEqual({ count: 6 });
  } finally { sqlite.close(); }
});

it('distinguishes a readable empty body from an unavailable identity', async () => {
  const { sqlite, db } = open();
  try {
    const ref = await db.transaction((tx) => stageBodyContent(tx, {
      hash: hash(Buffer.alloc(0)), byteLength: 0, chunks: chunks(Buffer.alloc(0))
    }));
    expect(await readBodyText(db, ref)).toBe('');
    expect(await loadVerifiedBodyRef(db, ref.hash)).toEqual(ref);
    expect(await loadVerifiedBodyRef(db, 'a'.repeat(64))).toBeNull();
    expect(await readBodyRange(db, ref, 0, 1)).toEqual(new Uint8Array(0));
    await expect(readBodyRange(db, ref, 0, BODY_CONTENT_CHUNK_BYTES + 1)).rejects.toThrow('body_range_invalid');
  } finally { sqlite.close(); }
});

it('rolls back failed coverage, hash and UTF-8 verification without publishing availability', async () => {
  const { sqlite, db } = open();
  try {
    const data = Buffer.alloc(BODY_CONTENT_CHUNK_BYTES + 1, 120);
    const identity = { hash: hash(data), byteLength: data.byteLength };
    async function* missingTail() { yield data.subarray(0, BODY_CONTENT_CHUNK_BYTES); }
    await expect(db.transaction((tx) => stageBodyContent(tx, { ...identity, chunks: missingTail() })))
      .rejects.toThrow('body_coverage_incomplete');
    await expect(db.transaction((tx) => stageBodyContent(tx, { ...identity,
      chunks: chunks(Buffer.alloc(data.byteLength, 121)) }))).rejects.toThrow('body_hash_mismatch');
    const invalid = Buffer.of(0xff);
    await expect(db.transaction((tx) => stageBodyContent(tx, { hash: hash(invalid), byteLength: 1,
      chunks: chunks(invalid) }))).rejects.toThrow();
    expect(sqlite.prepare('SELECT count(*) AS count FROM content_bodies').get()).toEqual({ count: 0 });
    expect(sqlite.prepare('SELECT count(*) AS count FROM content_body_chunks').get()).toEqual({ count: 0 });
  } finally { sqlite.close(); }
});

it('does not certify gaps or an extra chunk even if the stated byte length is valid', async () => {
  const { sqlite, db } = open();
  try {
    const data = Buffer.alloc(2 * BODY_CONTENT_CHUNK_BYTES, 120);
    const identity = { hash: hash(data), byteLength: data.byteLength };
    await db.run('INSERT INTO content_bodies (hash, byte_length, verified) VALUES (?, ?, 0)',
      [identity.hash, identity.byteLength]);
    await db.run('INSERT INTO content_body_chunks VALUES (?, ?, ?)',
      [identity.hash, BODY_CONTENT_CHUNK_BYTES, data.subarray(0, BODY_CONTENT_CHUNK_BYTES)]);
    await expect(verifyBodyContent(db, identity)).rejects.toThrow('body_coverage_incomplete');
    expect(await loadVerifiedBodyRef(db, identity.hash)).toBeNull();
  } finally { sqlite.close(); }
});

it('cannot move an unverified chunk into a verified body', async () => {
  const { sqlite, db } = open();
  try {
    const data = Buffer.from('verified');
    const ref = await db.transaction((tx) => stageBodyContent(tx, {
      hash: hash(data), byteLength: data.byteLength, chunks: chunks(data)
    }));
    const stagedHash = 'a'.repeat(64);
    await db.run('INSERT INTO content_bodies (hash, byte_length, verified) VALUES (?, ?, 0)',
      [stagedHash, BODY_CONTENT_CHUNK_BYTES + 1]);
    await db.run('INSERT INTO content_body_chunks VALUES (?, ?, ?)',
      [stagedHash, BODY_CONTENT_CHUNK_BYTES, Buffer.of(120)]);
    await expect(db.run('UPDATE content_body_chunks SET hash = ? WHERE hash = ?', [ref.hash, stagedHash]))
      .rejects.toThrow('body_content_immutable');
    expect(await readBodyText(db, ref)).toBe('verified');
  } finally { sqlite.close(); }
});
