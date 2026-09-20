// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { bootstrapCompanionDatabase } from '../../lib/core/database/companionDatabaseLifecycle.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

it('upgrades the previous mobile schema and preserves attachment relationships across restart', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-mobile-upgrade-'));
  const copy = path.join(root, 'fixture.db');
  const database = new Database(copy);
  try {
    const port = createBetterSqliteDbPort(database, { name: 'ios-upgrade-attachment' });
    const request = { allowCreate: true, expectedHostName: 'ios-upgrade-device', now: '2026-09-20T00:00:00.000Z' };
    await bootstrapCompanionDatabase(port, request);
    const id = 'a'.repeat(64);
    database.exec(`CREATE TABLE attachment_blobs (attachment_id TEXT PRIMARY KEY, content_hash TEXT,
      storage_key TEXT, mime_type TEXT, size_bytes INTEGER); PRAGMA user_version = 36;`);
    database.prepare('INSERT INTO attachments (id, mime_type, size_bytes, created_at) VALUES (?, ?, 80, ?)')
      .run(id, 'image/png', request.now);
    database.prepare('INSERT INTO attachment_blobs VALUES (?, ?, ?, ?, 80)').run(id, id, `${id}.png`, 'image/png');
    database.prepare("INSERT INTO node_attachments (node_id, attachment_id, role) SELECT id, ?, 'image' FROM nodes LIMIT 1").run(id);
    const before = database.prepare('SELECT * FROM attachments').all();
    const links = database.prepare('SELECT * FROM node_attachments').all();
    for (let run = 0; run < 2; run++) {
      await bootstrapCompanionDatabase(port, { allowCreate: false,
        expectedHostName: 'ios-upgrade-device', now: '2026-09-20T00:00:00.000Z' });
      expect(database.pragma('user_version', { simple: true })).toBe(37);
      expect(database.prepare('SELECT * FROM attachments').all()).toEqual(before);
      expect(database.prepare('SELECT * FROM node_attachments').all()).toEqual(links);
      expect(database.prepare("SELECT name FROM sqlite_master WHERE name = 'attachment_blobs'").get()).toBeUndefined();
    }
  } finally { database.close(); fs.rmSync(root, { recursive: true, force: true }); }
});
