// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { retireAttachmentRegistry } from './attachmentRegistryRetirement.js';
import { DESKTOP_CORE_SCHEMA_STATEMENTS } from './desktopCoreSchemaStatements.js';
import { DESKTOP_RESOURCE_SCHEMA_STATEMENTS } from './desktopResourceSchemaStatements.js';
import { SYNC_SCHEMA_STATEMENTS } from './syncSchemaStatements.js';
import { SYNC_STATE_SEQUENCE_SCHEMA_STATEMENTS } from './syncStateSequenceSchemaStatements.js';

it('removes the independent registry while retaining node-owned names and PDF index contents', () => {
  const db = new Database(':memory:');
  const pdf = 'a'.repeat(64);
  try {
    for (const sql of [...DESKTOP_CORE_SCHEMA_STATEMENTS, ...DESKTOP_RESOURCE_SCHEMA_STATEMENTS,
      ...SYNC_SCHEMA_STATEMENTS, ...SYNC_STATE_SEQUENCE_SCHEMA_STATEMENTS]) db.exec(sql);
    db.pragma('foreign_keys = ON');
    db.prepare("INSERT INTO nodes (id, title, created_at, updated_at) VALUES ('article', 'Article', 'now', 'now')").run();
    db.prepare(`INSERT INTO attachments (id, mime_type, original_name, created_at, pdf_index_status)
      VALUES (?, 'application/pdf', 'Original.pdf', 'now', 'ready')`).run(pdf);
    db.prepare("INSERT INTO node_attachments VALUES ('article', ?, 'reference')").run(pdf);
    db.prepare("INSERT INTO pdf_page_text VALUES (?, 1, 'Indexed text', 100, 200)").run(pdf);
    db.transaction(() => retireAttachmentRegistry(db))();
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name IN ('attachments', 'node_attachments')").all()).toEqual([]);
    expect(db.prepare("SELECT resource_references FROM nodes WHERE id = 'article'").get()).toEqual({
      resource_references: JSON.stringify([{ storage_key: `${pdf}.pdf`, role: 'reference', original_name: 'Original.pdf' }])
    });
    expect(db.prepare('SELECT text FROM pdf_page_text').get()).toEqual({ text: 'Indexed text' });
    expect(db.prepare('SELECT status FROM pdf_index_state').get()).toEqual({ status: 'ready' });
    expect(db.pragma('foreign_key_check')).toEqual([]);
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
  } finally { db.close(); }
});
