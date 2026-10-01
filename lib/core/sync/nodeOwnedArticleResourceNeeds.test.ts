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
    CREATE TABLE content_blobs (hash TEXT PRIMARY KEY, compression TEXT);
    CREATE TABLE content_blob_data (hash TEXT PRIMARY KEY, data BLOB);
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

it('keeps mounted PDF demand while waiting for the current body instead of scanning stale text', async () => {
  const { db, port } = fixture();
  try {
    db.prepare('INSERT INTO nodes VALUES (?, ?, ?, ?, ?)').run('article', `![stale](asset://${old})`, 'body',
      serializeNodeResourceReferences([{ storage_key: pdf, role: 'reference', original_name: 'Original.pdf' }]), null);
    db.prepare('INSERT INTO content_blobs VALUES (?, ?)').run('body', 'none');
    const result = await loadNodeOwnedArticleResourceNeeds(port, ['article']);
    expect(result.needs.map((need) => need.storageKey)).toEqual([pdf]);
    expect(result.unreadableArticleIds).toEqual(['article']);
    db.prepare('INSERT INTO content_blob_data VALUES (?, ?)').run('body', Buffer.from(`![current](asset://${image})`));
    expect((await loadNodeOwnedArticleResourceNeeds(port, ['article'])).needs.map((need) => need.storageKey).sort())
      .toEqual([image, pdf]);
  } finally { db.close(); }
});
