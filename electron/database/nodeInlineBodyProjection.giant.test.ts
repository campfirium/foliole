// @vitest-environment node
import { createHash } from 'node:crypto';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import type { DbRow } from '../../lib/core/sync/dbPort.js';
import { refreshNodeInlineBodiesForHashes } from '../../lib/core/sync/nodeInlineBodyProjection.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

function fixture(body: string, inline = '') {
  const db = new Database(':memory:');
  const bytes = Buffer.from(body);
  const hash = createHash('sha256').update(bytes).digest('hex');
  db.exec(`CREATE TABLE nodes (id TEXT PRIMARY KEY, body_blob_hash TEXT, content TEXT);
    CREATE TABLE content_blob_data (hash TEXT PRIMARY KEY, data BLOB);`);
  db.prepare('INSERT INTO nodes VALUES (?, ?, ?)').run('article', hash, inline);
  db.prepare('INSERT INTO content_blob_data VALUES (?, ?)').run(hash, bytes);
  const port = createBetterSqliteDbPort(db);
  const query = port.query.bind(port);
  port.query = async <T extends DbRow>(sql: string, params = [] as Parameters<typeof query>[1]) => {
    const rows = await query<T>(sql, params);
    expect(Buffer.byteLength(JSON.stringify(rows))).toBeLessThan(600_000);
    return rows;
  };
  return { db, hash, port, inline: () => db.prepare('SELECT content FROM nodes').pluck().get() };
}

const giantBody = '中😀'.repeat(900_000);

it('projects CRLF frontmatter from a giant persisted body without returning the body through the bridge', async () => {
  const f = fixture(`---\r\ntitle: 中文😀\r\n---\r\n${giantBody}`);
  try {
    await f.port.transaction((tx) => refreshNodeInlineBodiesForHashes(tx, [f.hash]));
    expect(f.inline()).toBe('---\ntitle: 中文😀\n---\n');
  } finally { f.db.close(); }
});

it('keeps giant ordinary and unclosed frontmatter bodies out of the inline projection', async () => {
  for (const body of [giantBody, `---\r\nlabel: ${giantBody}`]) {
    const f = fixture(body);
    try {
      await f.port.transaction((tx) => refreshNodeInlineBodiesForHashes(tx, [f.hash]));
      expect(f.inline()).toBe('');
    } finally { f.db.close(); }
  }
});

it('preserves UTF-8 and closing delimiters crossing persisted byte slice boundaries', async () => {
  const prefix = '---\r\nlabel: ';
  const filler = 'a'.repeat(262_144 - Buffer.byteLength(prefix) - 1);
  const delimiterFiller = 'b'.repeat(262_144 - Buffer.byteLength(prefix) - 3);
  for (const text of [`${filler}😀中`, delimiterFiller]) {
    const f = fixture(`${prefix}${text}\r\n---\r\n${giantBody}`);
    try {
      await f.port.transaction((tx) => refreshNodeInlineBodiesForHashes(tx, [f.hash]));
      expect(f.inline() === `---\nlabel: ${text}\n---\n`).toBe(true);
    } finally { f.db.close(); }
  }
});

it('replaces a retained whole-body inline copy but preserves independent inline content', async () => {
  const body = `---\r\ntitle: Original\r\n---\r\n${giantBody}`;
  for (const inline of [body, 'independent inline text']) {
    const f = fixture(body, inline);
    try {
      await f.port.transaction((tx) => refreshNodeInlineBodiesForHashes(tx, [f.hash]));
      expect(f.inline()).toBe(inline === body ? '---\ntitle: Original\n---\n' : inline);
      expect(f.db.prepare('SELECT length(data) FROM content_blob_data').pluck().get())
        .toBe(Buffer.byteLength(body));
    } finally { f.db.close(); }
  }
});
