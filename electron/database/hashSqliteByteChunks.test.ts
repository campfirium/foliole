// @vitest-environment node
import { createHash } from 'node:crypto';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { hashSqliteByteChunks } from '../../lib/core/sync/hashSqliteByteChunks.js';

function cachedBody(bytes: Buffer) {
  const sqlite = new Database(':memory:');
  sqlite.exec('CREATE TABLE cached_body (body BLOB NOT NULL)');
  sqlite.prepare('INSERT INTO cached_body VALUES (?)').run(bytes);
  const select = sqlite.prepare<[number, number], { hex: string }>(
    'SELECT hex(substr(CAST(body AS BLOB), ?, ?)) AS hex FROM cached_body');
  return { sqlite, read: async (offset: number, limit: number) => {
    const row = select.get(offset + 1, limit);
    if (!row) throw new Error('fixture_body_missing');
    return row.hex;
  } };
}

it('hashes a giant SQLite cache with exact bounded slices across UTF-8 boundaries', async () => {
  const bytes = Buffer.from('中😀'.repeat(460_000));
  const fixture = cachedBody(bytes);
  try {
    const calls: Array<{ offset: number; limit: number }> = [];
    const digest = await hashSqliteByteChunks(bytes.length, async (offset, limit) => {
      calls.push({ offset, limit });
      return fixture.read(offset, limit);
    });
    expect(digest).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(calls.length).toBe(Math.ceil(bytes.length / 262144));
    expect(calls.every((call, index) => call.offset === index * 262144 &&
      call.limit === Math.min(262144, bytes.length - call.offset))).toBe(true);
    expect(() => new TextDecoder('utf8', { fatal: true }).decode(bytes.subarray(0, 262144))).toThrow();
  } finally { fixture.sqlite.close(); }
});

it('hashes an empty SQLite cache without requesting a whole body or any slice', async () => {
  const fixture = cachedBody(Buffer.alloc(0));
  try {
    const size = fixture.sqlite.prepare('SELECT length(body) FROM cached_body').pluck().get();
    expect(size).toBe(0);
    expect(await hashSqliteByteChunks(Number(size), async () => {
      throw new Error('empty_body_must_not_be_read');
    })).toBe(createHash('sha256').digest('hex'));
  } finally { fixture.sqlite.close(); }
});

it('rejects invalid byte sizes before reading SQLite', async () => {
  for (const size of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await expect(hashSqliteByteChunks(size, async () => {
      throw new Error('invalid_size_must_not_be_read');
    })).rejects.toThrow('sqlite_byte_chunk_size_invalid');
  }
});

it('rejects truncated SQLite bytes and malformed or partial hexadecimal slices', async () => {
  const fixture = cachedBody(Buffer.from('中😀'));
  try {
    await expect(hashSqliteByteChunks(8, fixture.read)).rejects.toThrow('sqlite_byte_chunk_invalid');
    const real = await fixture.read(0, 7);
    for (const invalid of [real.slice(1), `G${real.slice(1)}`, `${real}00`]) {
      await expect(hashSqliteByteChunks(7, async () => invalid)).rejects.toThrow('sqlite_byte_chunk_invalid');
    }
  } finally { fixture.sqlite.close(); }
});

it('detects a same-length mutation in a giant persisted cache after the first block', async () => {
  const bytes = Buffer.from('中😀'.repeat(460_000));
  const fixture = cachedBody(bytes);
  try {
    const first = await hashSqliteByteChunks(bytes.length, fixture.read);
    const changed = Buffer.from(bytes);
    changed[262145] = 0x61;
    fixture.sqlite.prepare('UPDATE cached_body SET body = ?').run(changed);
    const second = await hashSqliteByteChunks(bytes.length, fixture.read);
    expect(second).not.toBe(first);
    expect(second).toBe(createHash('sha256').update(changed).digest('hex'));
  } finally { fixture.sqlite.close(); }
});
