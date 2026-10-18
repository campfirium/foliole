// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { serializeNodeResourceReferences } from '../database/nodeResourceReferences.js';

import { readAttachmentReferenceSnapshot } from './attachmentReferenceSnapshot.js';

const image = `${'a'.repeat(64)}.png`;
const pdf = `${'b'.repeat(64)}.pdf`;

function fixture(count = 1) {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE nodes (id TEXT PRIMARY KEY, content TEXT, body_blob_hash TEXT,
    resource_references TEXT NOT NULL DEFAULT '[]')`);
  const insert = db.prepare('INSERT INTO nodes(id, content, resource_references) VALUES (?, ?, ?)');
  for (let index = 0; index < count; index++) insert.run(`node-${index}`, `![image](asset://${image})`,
    serializeNodeResourceReferences([{ role: 'reference', storage_key: pdf, original_name: 'Original.pdf' }]));
  return { db, port: createBetterSqliteDbPort(db) };
}

it('collects the same references from 1000 nodes with bounded database round trips', async () => {
  const { db, port } = fixture(1000);
  try {
    const query = vi.spyOn(port, 'query');
    const result = await readAttachmentReferenceSnapshot(port);
    expect(new Set(result.storageKeys)).toEqual(new Set([image, pdf]));
    expect(query.mock.calls.length).toBeLessThanOrEqual(2 * Math.ceil(1000 / 128) + 5);
  } finally { db.close(); }
});

it('refuses to infer unreferenced files when any current body is unreadable', async () => {
  const { db, port } = fixture();
  try {
    db.exec("UPDATE nodes SET content = NULL, body_blob_hash = 'missing'");
    await expect(readAttachmentReferenceSnapshot(port)).rejects.toThrow('attachment_scan_body_unreadable');
  } finally { db.close(); }
});

it.each(['write', 'abort'] as const)('stops a scan after a concurrent %s', async action => {
  const { db, port } = fixture(256);
  const controller = new AbortController();
  try {
    const original = port.query.bind(port);
    let changed = false;
    vi.spyOn(port, 'query').mockImplementation(async (sql, params) => {
      const rows = await original(sql, params);
      if (!changed && sql.includes('body_blob_hash AS body_hash')) {
        changed = true;
        if (action === 'write') db.exec("UPDATE nodes SET content = '' WHERE id = 'node-0'");
        else controller.abort(new Error('scan_cancelled'));
      }
      return rows;
    });
    await expect(readAttachmentReferenceSnapshot(port, controller.signal)).rejects.toThrow(
      action === 'write' ? 'attachment_scan_database_changed' : 'scan_cancelled');
    expect(changed).toBe(true);
  } finally { db.close(); }
});
