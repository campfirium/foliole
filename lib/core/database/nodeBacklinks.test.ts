// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { createBetterSqlite3Driver } from '../../../electron/database/betterSqlite3Driver.js';

import { loadNodeBacklinks } from './nodeBacklinks.js';

let db: Database.Database;
beforeEach(() => {
  db = new Database(':memory:');
  db.exec('CREATE TABLE nodes (id TEXT PRIMARY KEY, title TEXT, content TEXT, deleted_at TEXT)');
});
afterEach(() => db.close());

function insert(id: string, title: string, content = '', deletedAt: string | null = null) {
  db.prepare('INSERT INTO nodes VALUES (?, ?, ?, ?)').run(id, title, content, deletedAt);
}

function read() {
  return loadNodeBacklinks(createBetterSqlite3Driver(db), 'target');
}

it('matches case and whitespace while excluding embedded links', () => {
  insert('target', 'topic a');
  insert('source', ' Source ', '![[Topic A]]\nBefore [[  Topic A ]] after');
  insert('embedded', 'Embedded', '![[Topic A]]');
  expect(read()).toEqual([{
    source_node_id: 'source', source_title: 'Source',
    context: 'Before [[ Topic A ]] after', match_count: 1
  }]);
});

it.each([
  ['K', '\u212A'],
  ['Äpfel', 'äpfel'],
  ['阅读笔记', '阅读笔记'],
  ['100%_done', '100%_done']
])('preserves matching for title %s', (title, link) => {
  insert('target', title);
  insert('source', '', `[[${link}]]`);
  insert('plain', 'Plain', title);
  insert('other', 'Other', '[[100xxdone]]');
  expect(read()).toEqual([{
    source_node_id: 'source', source_title: 'Untitled', context: `[[${link}]]`, match_count: 1
  }]);
});

it('excludes deleted sources and the target itself, and ignores unavailable targets', () => {
  insert('target', 'Topic', '[[Topic]]');
  insert('deleted', 'Deleted', '[[Topic]]', 'now');
  insert('source', 'Source', '[[Topic]]');
  expect(read().map(row => row.source_node_id)).toEqual(['source']);
  db.prepare("UPDATE nodes SET deleted_at = 'now' WHERE id = 'target'").run();
  expect(read()).toEqual([]);
  db.prepare("DELETE FROM nodes WHERE id = 'target'").run();
  expect(read()).toEqual([]);
  insert('target', '  ');
  expect(read()).toEqual([]);
});

it('counts all matches and truncates the first matching line after normalizing whitespace', () => {
  insert('target', 'Topic');
  const firstLine = `  [[Topic]] ${'a'.repeat(150)}  `;
  insert('source', 'Source', `Unrelated line\n${firstLine}\n[[topic]] and [[ TOPIC ]]`);
  expect(read()).toEqual([{
    source_node_id: 'source', source_title: 'Source',
    context: `[[Topic]] ${'a'.repeat(127)}...`, match_count: 3
  }]);
});

it('keeps source insertion order rather than sorting by id or title', () => {
  insert('target', 'Topic');
  insert('z', 'Zebra', '[[Topic]]');
  insert('plain', 'Plain', 'No links');
  insert('a', 'Apple', '[[Topic]]');
  expect(read().map(row => row.source_node_id)).toEqual(['z', 'a']);
});
