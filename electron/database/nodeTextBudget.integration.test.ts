// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { writeNodeBody } from '../../lib/core/database/nodeBodyMutation.js';
import { updateNodeAnchorLinks, upsertNodeSnapshot, type UpsertNodeSnapshotInput } from '../../lib/core/database/nodeMutations.js';
import { NODE_TEXT_MAX_BYTES } from '../../lib/core/nodes/nodeTextBudget.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { textDevice } from './topicTextState.testSupport.js';

const timestamp = '2026-10-09T00:00:00.000Z';

function initializeHost(sqlite: Database.Database) {
  sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
    .run('host_name', JSON.stringify('budget-test'), timestamp);
}

function nodeInput(patch: Partial<UpsertNodeSnapshotInput> = {}): UpsertNodeSnapshotInput {
  return { anchorLink: null, content: 'Original', createdAt: timestamp,
    isTitleManual: true, kind: 'item', nodeId: 'item', parentNodeId: null,
    position: null, reveal: 'Answer', title: 'Title', updatedAt: timestamp, ...patch };
}

it.each(['reveal'])('rejects an oversized %s before creating or modifying any node', (field) => {
  const host = textDevice();
  try {
    initializeHost(host.sqlite);
    const driver = createBetterSqlite3Driver(host.sqlite);
    upsertNodeSnapshot(driver, nodeInput());
    const before = host.sqlite.prepare('SELECT * FROM nodes ORDER BY id').all();
    const bad = { [field]: '中'.repeat(349_526) };
    expect(() => upsertNodeSnapshot(driver, nodeInput(bad))).toThrow(`node_text_too_large:${field}`);
    expect(() => upsertNodeSnapshot(driver, nodeInput({ ...bad, nodeId: 'new' }))).toThrow(`node_text_too_large:${field}`);
    expect(host.sqlite.prepare('SELECT * FROM nodes ORDER BY id').all()).toEqual(before);
    expect(host.sqlite.pragma('foreign_key_check')).toEqual([]);
  } finally { host.sqlite.close(); }
});

it('saves a shortened new title and keeps a historical title when only the body changes', () => {
  const host = textDevice();
  try {
    initializeHost(host.sqlite);
    const driver = createBetterSqlite3Driver(host.sqlite);
    const title = '中😀'.repeat(50);
    upsertNodeSnapshot(driver, nodeInput({ title: title + 'extra' }));
    expect(host.sqlite.prepare("SELECT title, content FROM nodes WHERE id='item'").get())
      .toEqual({ title, content: 'Original' });
    const historicalTitle = 'Historical'.repeat(20);
    host.sqlite.prepare("UPDATE nodes SET title=? WHERE id='item'").run(historicalTitle);
    upsertNodeSnapshot(driver, nodeInput({ title: historicalTitle, content: 'Changed body' }));
    expect(host.sqlite.prepare("SELECT title, content FROM nodes WHERE id='item'").get())
      .toEqual({ title: historicalTitle, content: 'Changed body' });
    upsertNodeSnapshot(driver, nodeInput({ title: 'x'.repeat(NODE_TEXT_MAX_BYTES + 1) }));
    expect(host.sqlite.prepare("SELECT title FROM nodes WHERE id='item'").pluck().get()).toBe('x'.repeat(100));
  } finally { host.sqlite.close(); }
});

it('accepts an exact-limit answer and preserves it after reopening the database', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'foliole-node-text-budget-'));
  const databasePath = path.join(root, 'library.sqlite');
  let sqlite = new Database(databasePath);
  try {
    initializeDatabaseSchema(sqlite);
    initializeHost(sqlite);
    const reveal = '中'.repeat(349_525) + 'x';
    expect(Buffer.byteLength(reveal)).toBe(NODE_TEXT_MAX_BYTES);
    upsertNodeSnapshot(createBetterSqlite3Driver(sqlite), nodeInput({ reveal }));
    sqlite.close();
    sqlite = new Database(databasePath);
    expect(sqlite.prepare("SELECT reveal FROM nodes WHERE id='item'").pluck().get()).toBe(reveal);
  } finally { sqlite.close(); rmSync(root, { recursive: true, force: true }); }
});

it('rejects a grouped anchor atomically before updating another anchor in the same request', () => {
  const host = textDevice();
  try {
    initializeHost(host.sqlite);
    const driver = createBetterSqlite3Driver(host.sqlite);
    upsertNodeSnapshot(driver, nodeInput());
    const before = host.sqlite.prepare("SELECT * FROM nodes WHERE id='item'").get();
    const anchorLink = { id: 'group', kind: 'cloze', locator: { ranges: [
      { from: 0, to: 524_288, originalText: 'x'.repeat(524_288) },
      { from: 524_288, to: 1_048_577, originalText: 'x'.repeat(524_289) }
    ] } } satisfies NonNullable<UpsertNodeSnapshotInput['anchorLink']>;
    expect(() => updateNodeAnchorLinks(driver, [
      { nodeId: 'item', updatedAt: timestamp, anchorLink: { id: 'valid', kind: 'cloze' } },
      { nodeId: 'item', updatedAt: timestamp, anchorLink }
    ])).toThrow('node_text_too_large:anchorText');
    expect(host.sqlite.prepare("SELECT * FROM nodes WHERE id='item'").get()).toEqual(before);
  } finally { host.sqlite.close(); }
});

it('uses a shortened title for a body preview without overwriting the stored title', () => {
  const host = textDevice();
  try {
    initializeHost(host.sqlite);
    const driver = createBetterSqlite3Driver(host.sqlite);
    upsertNodeSnapshot(driver, nodeInput());
    writeNodeBody({ driver, nodeId: 'item', title: 'x'.repeat(NODE_TEXT_MAX_BYTES + 1), updatedAt: timestamp,
      content: 'Changed body' });
    expect(host.sqlite.prepare("SELECT title, content FROM nodes WHERE id='item'").get())
      .toEqual({ title: 'Title', content: 'Changed body' });
  } finally { host.sqlite.close(); }
});
