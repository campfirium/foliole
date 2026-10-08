// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

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
