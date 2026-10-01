// @vitest-environment node
import Sqlite from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import type { DatabaseDriver } from './driver.js';
import { searchWorkspace } from './workspaceSearch.js';

function fixture(tokenizer: 'trigram' | 'unicode61') {
  const db = new Sqlite(':memory:');
  db.exec(`ATTACH DATABASE ':memory:' AS search;
    CREATE VIRTUAL TABLE search.node_search USING fts5(node_id UNINDEXED, title, path, content,
      updated_at UNINDEXED, is_trashed UNINDEXED, tokenize='${tokenizer}');
    CREATE VIRTUAL TABLE search.pdf_search USING fts5(node_id UNINDEXED, title, path, text,
      attachment_id UNINDEXED, page UNINDEXED, updated_at UNINDEXED, page_text_length UNINDEXED,
      is_trashed UNINDEXED, tokenize='${tokenizer}');
    CREATE TABLE search.pdf_page_map (row_id INTEGER, node_id TEXT, attachment_id TEXT, page INTEGER);`);
  const driver = { queryAll: (sql: string, params: unknown[] = []) => db.prepare(sql).all(...params) } as DatabaseDriver;
  const node = (id: string, content: string, trashed = 0) => db.prepare('INSERT INTO search.node_search VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, 'Entry', '', content, '2026-10-01', trashed);
  return { db, driver, node };
}

it('processes a long candidate once even when the matching spelling is last in a large synonym group', () => {
  const { db, driver, node } = fixture('trigram');
  const content = 'Ordinary catalogue material. '.repeat(5000) + '你好';
  const groups = [['hello', 'hallo', 'hola', 'bonjour', 'ciao', 'こんにちは', '안녕하세요', 'cześć', 'olá', 'привет', '你好']];
  node('long', content);
  const normalize = vi.spyOn(String.prototype, 'normalize');
  try {
    const results = searchWorkspace(driver, 'hello', groups);
    expect(results).toHaveLength(1);
    expect(results[0]?.nodeMatch).toMatchObject({ query: '你好', from: content.length - 2, to: content.length });
    // Work must stay bounded by candidate text, rather than group size or retrieval duplicates.
    expect(normalize.mock.calls.length).toBeLessThan(content.length * 3);
  } finally {
    normalize.mockRestore();
    db.close();
  }
});

it.each(['trigram', 'unicode61'] as const)('keeps Boolean, short-term, Unicode and trash evidence with %s', (tokenizer) => {
  const { db, driver, node } = fixture(tokenizer);
  try {
    const groups = [['hello', '你好', 'cafe', 'AI']];
    node('original', 'hello include');
    node('short', '前文你好后文 include');
    node('accent', '😀 cafe\u0301 include');
    node('width', 'hello 😀 ＡＩ include');
    node('excluded', '你好 include exclude');
    node('substring', 'helloworld include');
    node('trash', '你好 include', 1);
    const results = searchWorkspace(driver, 'hello AND include NOT exclude', groups);
    expect(results.map((row) => row.id).sort()).toEqual(['accent', 'original', 'short', 'trash', 'width']);
    expect(results.at(-1)?.id).toBe('trash');
    expect(results.find((row) => row.id === 'original')?.matchedOriginal).toBe(true);
    const accent = results.find((row) => row.id === 'accent')!.nodeMatch!;
    expect('😀 cafe\u0301 include'.slice(accent.from, accent.to)).toBe('cafe\u0301');
    const width = results.find((row) => row.id === 'width')!.aliasMatches!.find((row) => row.spelling === 'ai')!.nodeMatch!;
    expect('hello 😀 ＡＩ include'.slice(width.from, width.to)).toBe('ＡＩ');
    expect(searchWorkspace(driver, 'hello OR unrelated', groups).map((row) => row.id)).toContain('short');
    db.prepare('DELETE FROM search.node_search WHERE node_id = ?').run('trash');
    expect(searchWorkspace(driver, 'hello', groups).map((row) => row.id)).not.toContain('trash');
  } finally { db.close(); }
});
