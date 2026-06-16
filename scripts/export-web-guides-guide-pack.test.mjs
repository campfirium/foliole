import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { Buffer } from 'node:buffer';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { exportGuidePack } from './export-web-guides-guide-pack.ts';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

async function withFixture(test) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'foliole-guide-pack-'));
  try {
    const dbPath = path.join(dir, 'foliole.db');
    const outputPath = path.join(dir, 'guidePack.ts');
    const db = new Database(dbPath);
    createSchema(db);
    seedFixture(db);
    db.close();
    return await test({ dbPath, outputPath });
  } finally {
    await rm(dir, { force: true, recursive: true }).catch(() => undefined);
  }
}

function createSchema(db) {
  db.exec(`
    CREATE TABLE nodes (
      id TEXT PRIMARY KEY,
      parent_id TEXT,
      kind TEXT NOT NULL DEFAULT 'topic',
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      body_blob_hash TEXT,
      opening_text TEXT,
      reveal TEXT,
      anchor_link TEXT,
      manual_child_order TEXT,
      virtual_filter TEXT,
      shelved_at TEXT,
      created_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE content_blob_data (hash TEXT PRIMARY KEY, data BLOB NOT NULL);
  `);
}

function insertNode(db, row) {
  db.prepare(`
    INSERT INTO nodes (
      id, parent_id, kind, title, content, body_blob_hash, opening_text, reveal,
      anchor_link, manual_child_order, virtual_filter, shelved_at, created_at, deleted_at
    ) VALUES (
      @id, @parent_id, @kind, @title, @content, @body_blob_hash, @opening_text, @reveal,
      @anchor_link, @manual_child_order, @virtual_filter, @shelved_at, @created_at, @deleted_at
    )
  `).run({
    anchor_link: null,
    body_blob_hash: null,
    content: '',
    deleted_at: null,
    kind: 'topic',
    manual_child_order: null,
    opening_text: null,
    parent_id: null,
    reveal: null,
    shelved_at: null,
    virtual_filter: null,
    ...row
  });
}

function seedFixture(db) {
  db.prepare('INSERT INTO content_blob_data (hash, data) VALUES (?, ?)').run(
    'body-b',
    Buffer.from('# Reading first\n\nBlob paragraph.', 'utf8')
  );
  insertNode(db, {
    id: 'root',
    kind: 'folder',
    title: 'Foliole Guide Preview',
    manual_child_order: JSON.stringify(['topic-b', 'topic-a', 'virtual-topic']),
    created_at: '2026-06-01T00:00:00.000Z'
  });
  insertNode(db, { id: 'topic-a', parent_id: 'root', title: 'Topic A', content: 'A body', created_at: '2026-06-01T00:02:00.000Z' });
  insertNode(db, {
    id: 'topic-b',
    parent_id: 'root',
    title: 'Topic B',
    content: 'fallback',
    body_blob_hash: 'body-b',
    opening_text: 'Opening B',
    manual_child_order: JSON.stringify(['highlight-b', 'cloze-b', 'visual-b']),
    created_at: '2026-06-01T00:01:00.000Z'
  });
  insertNode(db, {
    id: 'highlight-b',
    parent_id: 'topic-b',
    title: 'Important phrase',
    anchor_link: JSON.stringify({ id: 'topic-b', kind: 'highlight', locator: { from: 2, to: 10, originalText: 'Reading' } }),
    created_at: '2026-06-01T00:03:00.000Z'
  });
  insertNode(db, {
    id: 'visual-b',
    parent_id: 'topic-b',
    title: 'Visual highlight',
    anchor_link: JSON.stringify({ id: 'topic-b', kind: 'highlight', locator: { page: 1, x: 0.1, y: 0.2 } }),
    created_at: '2026-06-01T00:04:00.000Z'
  });
  insertNode(db, {
    id: 'cloze-b',
    parent_id: 'topic-b',
    kind: 'item',
    title: 'Cloze B',
    content: 'Foliole turns reading into [...].',
    reveal: 'review',
    created_at: '2026-06-01T00:05:00.000Z'
  });
  insertNode(db, {
    id: 'virtual-topic',
    parent_id: 'root',
    title: 'Virtual topic',
    virtual_filter: '{"kind":"all"}',
    created_at: '2026-06-01T00:06:00.000Z'
  });
  insertNode(db, { id: 'outside', title: 'Outside', content: 'private', created_at: '2026-06-01T00:07:00.000Z' });
}

describe('web guides Guide Pack export', () => {
  it('exports only the selected subtree in manual child order', async () => {
    await withFixture(async ({ dbPath, outputPath }) => {
      const pack = await exportGuidePack({ dbPath, outputPath, rootTitle: 'Foliole Guide Preview' });
      expect(pack.topics.map((topic) => topic.id)).toEqual(['topic-b', 'topic-a']);
      expect(pack.topics[0].blocks[0]).toMatchObject({ kind: 'heading', text: 'Reading first' });
      expect(pack.topics[0].highlights[0]).toMatchObject({ excerpt: 'Important phrase' });
      expect(pack.topics[0].reviewItems[0]).toMatchObject({ answer: 'review', kind: 'cloze' });
      expect(JSON.stringify(pack)).not.toContain('private');
      expect(pack.source.warnings).toEqual(expect.arrayContaining([
        expect.stringContaining('virtual: Virtual topic'),
        expect.stringContaining('non-text-anchor: Visual highlight')
      ]));
      await expect(readFile(outputPath, 'utf8')).resolves.toContain('GENERATED_GUIDE_PACK');
    });
  });

  it('fails without replacing the output when the root is missing', async () => {
    await withFixture(async ({ dbPath, outputPath }) => {
      await writeFile(outputPath, 'keep me', 'utf8');
      await expect(exportGuidePack({ dbPath, outputPath, rootTitle: 'Missing' })).rejects.toThrow(
        'Expected exactly one Glide root'
      );
      await expect(readFile(outputPath, 'utf8')).resolves.toBe('keep me');
    });
  });
});
