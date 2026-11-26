// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { createBetterSqlite3Driver } from '../../../electron/database/betterSqlite3Driver.js';

import {
  collectNodeBacklinkRecords,
  loadNodeBacklinks,
  NODE_BACKLINK_TARGET_SQL,
  nodeBacklinkSourcesQuery,
  nodeBacklinkTitleNeedles
} from './nodeBacklinks.js';

let db: Database.Database;
beforeEach(() => {
  db = new Database(':memory:');
  db.exec('CREATE TABLE nodes (id TEXT PRIMARY KEY, title TEXT, content TEXT, deleted_at TEXT)');
});
afterEach(() => db.close());

function insert(id: string, title: string, content = '', deletedAt: string | null = null) {
  db.prepare('INSERT INTO nodes VALUES (?, ?, ?, ?)').run(id, title, content, deletedAt);
}

const SOURCES_SQL = `SELECT id, title, content FROM nodes
  WHERE id != ? AND deleted_at IS NULL AND instr(content, '[[') > 0 ORDER BY rowid`;

// Reference result without any title prefilter: every linked body goes through the JS matcher.
function readUnfiltered() {
  const target = db.prepare(NODE_BACKLINK_TARGET_SQL).get('target') as { title: string } | undefined;
  if (!target?.title.trim()) return [];
  return collectNodeBacklinkRecords(target,
    db.prepare(SOURCES_SQL).all('target') as { id: string; title: string; content: string }[]);
}

function readPrefilteredRows() {
  const target = db.prepare(NODE_BACKLINK_TARGET_SQL).get('target') as { title: string } | undefined;
  if (!target?.title.trim()) return [];
  const query = nodeBacklinkSourcesQuery('target', target.title);
  return db.prepare(query.sql).all(...query.params) as { id: string; title: string; content: string }[];
}

// The SQL prefilter must be lossless: both runtimes return exactly what the unfiltered matcher returns.
function read() {
  const desktop = loadNodeBacklinks(createBetterSqlite3Driver(db), 'target');
  const target = db.prepare(NODE_BACKLINK_TARGET_SQL).get('target') as { title: string } | undefined;
  expect(collectNodeBacklinkRecords(target, readPrefilteredRows())).toEqual(desktop);
  expect(readUnfiltered()).toEqual(desktop);
  return desktop;
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

it.each([
  ['K', '\u212A'],
  ['kit', '\u212AIT'],
  ['i\u0307x', '\u0130X'],
  ['ix', 'IX'],
  ['Äpfel', 'äPFEL'],
  ['Σοφία', 'ΣΟΦΊΑ'],
  ['Straße', 'STRAßE'],
  ['阅读笔记', '阅读笔记'],
  ['Rust 2024 笔记', 'rUST 2024 笔记'],
  ['100%_done', '100%_DONE'],
  ['Foo-Bar', 'foo-bar'],
  ['  Topic A  ', '  topic a '],
  ['a\u3000b', 'A\u3000B'],
  ['🌱 Growth', '🌱 GROWTH']
])('keeps every case variant of %j when prefiltering in SQL', (title, link) => {
  insert('target', title);
  insert('source', 'Source', `See [[${link}]]`);
  insert('miss', 'Miss', '[[Something else entirely]]');
  expect(read().map(row => row.source_node_id)).toEqual(['source']);
});

it.each([
  ['阅读笔记', ['阅读笔记']],
  ['100%_done', ['100%_done']],
  [' Topic A ', ['top', 'c a']],
  ['Äpfel', ['pfel']],
  ['K', []],
  ['kit', ['t']],
  ['i\u0307x', ['x']],
  ['Σοφία', []],
  ['Rust 2024 笔记', ['rust 2024 笔记']],
  ['   ', []]
])('derives lossless prefilter needles for %j', (title, needles) => {
  expect(nodeBacklinkTitleNeedles(title)).toEqual(needles);
});

it('keeps SQL rows constant for letter-only and punctuated titles as unrelated links grow', () => {
  const measure = (title: string, padding: number) => {
    db.exec('DELETE FROM nodes');
    insert('target', title);
    insert('source', 'Source', `Read [[${title.toUpperCase()}]] first`);
    for (let index = 0; index < padding; index += 1) {
      insert(`pad-${index}`, `Pad ${index}`, `Unrelated [[Note-${index}]] and [[Other - topic]] ${'x'.repeat(500)}`);
    }
    const rows = readPrefilteredRows();
    expect(read().map(row => row.source_node_id)).toEqual(['source']);
    return { rows: rows.length, bytes: Buffer.byteLength(JSON.stringify(rows)) };
  };
  for (const title of ['Photosynthesis', 'Rust-Book']) {
    expect(measure(title, 200)).toEqual(measure(title, 600));
    expect(measure(title, 600).rows).toBe(1);
  }
});
