// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { BODY_CONTENT_CHUNK_BYTES, BODY_CONTENT_SCHEMA } from '../database/bodyContentSchema.js';
import { projectNodeInlineContent } from '../database/nodeInlineProjection.js';

import { stageTextBodyContent } from './bodyContentWrite.js';
import { streamBodyFrontmatter } from './bodyFrontmatterText.js';
import type { DbPort, DbRow } from './dbPort.js';

it.each([
  '', '---', 'not frontmatter\n---\n' + 'x'.repeat(3 * 1024 * 1024),
  '---\r\nkey: 中文😀\r\n---\r\nBody', '\ufeff---\nkey: value\n---\r',
  '---\n---', '---\n---\nBody', '---\n----\nBody',
  '---\n' + 'x'.repeat(BODY_CONTENT_CHUNK_BYTES - 5) + '\r\n---\r\nBody',
  '---\n' + 'x'.repeat(3 * 1024 * 1024 - 8) + '\n---',
  '---\n' + 'x'.repeat(3 * 1024 * 1024 - 4)
])('streams exactly the original prefix projection from its persistent byte range', async (body) => {
  const sqlite = new Database(':memory:');
  try {
    for (const sql of BODY_CONTENT_SCHEMA) sqlite.exec(sql);
    const db = createBetterSqliteDbPort(sqlite);
    const ref = await db.transaction((tx) => stageTextBodyContent(tx, body));
    let readBytes = 0;
    let maximumRead = 0;
    const observed: DbPort = { ...db, query: async <T extends DbRow>(sql: string, params?: Parameters<DbPort['query']>[1]) => {
      const rows = await db.query<T>(sql, params);
      for (const row of rows) if (row.data instanceof Uint8Array) {
        readBytes += row.data.byteLength;
        maximumRead = Math.max(maximumRead, row.data.byteLength);
      }
      return rows;
    } };
    let actual = '';
    for await (const part of streamBodyFrontmatter(observed, ref)) actual += part;
    expect(actual).toBe(projectNodeInlineContent(body));
    expect(readBytes).toBe(ref.frontmatterEnd ?? 0);
    expect(maximumRead).toBeLessThanOrEqual(BODY_CONTENT_CHUNK_BYTES);
  } finally { sqlite.close(); }
});
