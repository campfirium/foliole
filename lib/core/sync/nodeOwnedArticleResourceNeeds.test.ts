// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { serializeNodeResourceReferences } from '../database/nodeResourceReferences.js';

import { loadNodeOwnedArticleResourceNeeds } from './nodeOwnedArticleResourceNeeds.js';

function fixture() {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE nodes (id TEXT PRIMARY KEY, content TEXT, body_blob_hash TEXT,
    resource_references TEXT NOT NULL DEFAULT '[]', image_sources TEXT);
    CREATE TABLE node_sync_versions (snapshot_json TEXT);`);
  return { db, port: createBetterSqliteDbPort(db, { name: 'node-owned-resource-needs' }) };
}
const image = `${'a'.repeat(64)}.png`;
const old = `${'b'.repeat(64)}.png`;
const pdf = `${'c'.repeat(64)}.pdf`;

it('reads a library through bounded batches rather than one bridge query per article', async () => {
  const { db, port } = fixture();
  try {
    const ids = Array.from({ length: 512 }, (_, index) => `article-${index}`);
    const insert = db.prepare('INSERT INTO nodes(id, content) VALUES (?, ?)');
    for (const id of ids) insert.run(id, `![current](asset://${image})`);
    const query = vi.spyOn(port, 'query');
    const result = await loadNodeOwnedArticleResourceNeeds(port, ids);
    expect(result.needs.map(need => need.storageKey)).toEqual([image]);
    expect(result.unreadableArticleIds).toEqual([]);
    expect(query.mock.calls.length).toBeLessThanOrEqual(16);
  } finally { db.close(); }
});

it('keeps large bodies separate and preserves missing-body and caller-order results', async () => {
  const { db, port } = fixture();
  try {
    const insert = db.prepare('INSERT INTO nodes(id, content, body_blob_hash) VALUES (?, ?, ?)');
    for (const id of ['large-a', 'large-b']) insert.run(id, 'x'.repeat(700_000), null);
    insert.run('oversized', 'x'.repeat(1_100_000), null);
    insert.run('missing-b', null, 'body-b');
    insert.run('missing-a', null, 'body-a');
    const query = port.query.bind(port);
    const sizes: number[][] = [];
    vi.spyOn(port, 'query').mockImplementation(async (sql, params) => {
      const rows = await query(sql, params);
      if (sql.includes('body_blob_hash AS body_hash')) {
        sizes.push(rows.map(row => typeof row.content === 'string' ? row.content.length : 0));
      }
      return rows;
    });
    const result = await loadNodeOwnedArticleResourceNeeds(port,
      ['large-a', 'large-b', 'oversized', 'absent', 'missing-b', 'missing-a', 'missing-b']);
    expect(result).toEqual({ needs: [], unreadableArticleIds: ['missing-b', 'missing-a'] });
    expect(sizes.every(batch => batch.length === 1 || batch.reduce((sum, size) => sum + size, 0) <= 1_048_576)).toBe(true);
  } finally { db.close(); }
});

it('collects current Markdown images and mounted files with no attachment tables', async () => {
  const { db, port } = fixture();
  try {
    db.prepare('INSERT INTO nodes VALUES (?, ?, ?, ?, ?)').run('article',
      `![current](asset://${image})\n\n\`![code](asset://${old})\`\n\n[link](asset://${old})`, null,
      serializeNodeResourceReferences([
        { storage_key: old, role: 'image', original_name: 'Removed.png' },
        { storage_key: pdf, role: 'reference', original_name: 'Original.pdf' }
      ]), JSON.stringify({ [old]: 'https://example.com/unused.png' }));
    db.prepare('INSERT INTO node_sync_versions VALUES (?)').run(JSON.stringify({ content: `![old](asset://${old})` }));
    const result = await loadNodeOwnedArticleResourceNeeds(port, ['article', 'article']);
    expect(result.needs.map((need) => need.storageKey).sort()).toEqual([image, pdf]);
    expect(result.unreadableArticleIds).toEqual([]);
    expect(await loadNodeOwnedArticleResourceNeeds(port, [])).toEqual({ needs: [], unreadableArticleIds: [] });
  } finally { db.close(); }
});

it('reads exact current text with a hash and keeps mounted files without shared body tables', async () => {
  const { db, port } = fixture();
  try {
    db.prepare('INSERT INTO nodes VALUES (?, ?, ?, ?, ?)').run('article', `![current](asset://${image})`, 'body',
      serializeNodeResourceReferences([{ storage_key: pdf, role: 'reference', original_name: 'Original.pdf' }]), null);
    const result = await loadNodeOwnedArticleResourceNeeds(port, ['article']);
    expect(result.needs.map((need) => need.storageKey).sort()).toEqual([image, pdf]);
    expect(result.unreadableArticleIds).toEqual([]);
    db.prepare('UPDATE nodes SET content = ? WHERE id = ?').run('', 'article');
    expect((await loadNodeOwnedArticleResourceNeeds(port, ['article'])).needs.map((need) => need.storageKey))
      .toEqual([pdf]);
  } finally { db.close(); }
});
