// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';

import { loadArticleAttachmentNeeds } from './articleAttachmentNeeds.js';

const db = new Database(':memory:');
const port = createBetterSqliteDbPort(db, { name: 'article-attachment-needs' });
db.exec(`CREATE TABLE nodes (id TEXT PRIMARY KEY, content TEXT, body_blob_hash TEXT, resource_references TEXT NOT NULL DEFAULT '[]');
  CREATE TABLE content_blobs (hash TEXT PRIMARY KEY, compression TEXT);
  CREATE TABLE content_blob_data (hash TEXT PRIMARY KEY, data BLOB);
  CREATE TABLE attachments (id TEXT PRIMARY KEY, mime_type TEXT, size_bytes INTEGER);
  CREATE TABLE node_attachments (node_id TEXT, attachment_id TEXT, role TEXT);`);
afterEach(() => {
  for (const table of ['nodes', 'content_blobs', 'content_blob_data', 'attachments', 'node_attachments']) db.exec(`DELETE FROM ${table}`);
});
const image = `${'a'.repeat(64)}.png`;
const pdf = 'b'.repeat(64);
const old = 'c'.repeat(64);
const put = (id: string, content: string, hash: string | null = null) => db.prepare('INSERT INTO nodes (id, content, body_blob_hash) VALUES (?, ?, ?)').run(id, content, hash);

it('collects current parsed image demand and valid PDFs only for participating articles', async () => {
  put('one', `![photo](asset://${image})\n\n![ref][x]\n\n[x]: <asset://${image}>\n\n\`![code](asset://${old}.png)\`\n[ordinary](asset://${old}.png)`);
  put('two', `![shared](asset://${image})`);
  put('unrelated', `![other](asset://${old}.png)`);
  db.prepare('INSERT INTO attachments (id, mime_type) VALUES (?, ?)').run(pdf, 'application/pdf');
  db.prepare('INSERT INTO attachments (id, mime_type) VALUES (?, ?)').run(old, 'image/png');
  db.prepare('UPDATE nodes SET resource_references = ? WHERE id = ?').run(JSON.stringify([
    { storage_key: `${pdf}.pdf`, original_name: 'Original.pdf', role: 'reference' }
  ]), 'one');
  db.prepare('INSERT INTO node_attachments VALUES (?, ?, ?)').run('one', old, 'image');
  const result = await loadArticleAttachmentNeeds(port, ['one', 'two', 'one']);
  expect(result.needs.map((need) => need.storageKey)).toEqual([`${pdf}.pdf`, image]);
  expect(result.unreadableArticleIds).toEqual([]);
  expect(await loadArticleAttachmentNeeds(port, [])).toEqual({ needs: [], unreadableArticleIds: [] });
});

it('uses owned current text and ignores obsolete shared body data', async () => {
  put('one', `![current](asset://${image})`, 'body');
  db.prepare('INSERT INTO content_blobs VALUES (?, ?)').run('body', 'none');
  db.prepare('INSERT INTO content_blob_data VALUES (?, ?)').run('body', Buffer.from(`![old](asset://${old}.png)`));
  expect((await loadArticleAttachmentNeeds(port, ['one'])).needs.map((need) => need.storageKey))
    .toEqual([image]);
});

it('does not use registry byte counts as file transfer truth', async () => {
  put('one', `![photo](asset://${image})`);
  db.prepare('INSERT INTO attachments VALUES (?, ?, ?)').run('a'.repeat(64), 'image/png', 1);
  const result = await loadArticleAttachmentNeeds(port, ['one']);
  expect(result.needs).toEqual([{ attachmentId: 'a'.repeat(64), contentHash: 'a'.repeat(64),
    storageKey: image, mimeType: 'image/png' }]);
});
