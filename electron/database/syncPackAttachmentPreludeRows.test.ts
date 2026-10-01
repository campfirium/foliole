// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';

let appData = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(appData, 'cache'),
    app_config_dir: path.join(appData, 'config'),
    app_data_dir: appData,
    app_log_dir: path.join(appData, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { loadPackRows } from './syncPackRows.js';

afterEach(async () => {
  closeDatabaseConnection();
  if (appData) await fs.rm(appData, { recursive: true, force: true });
});

it('carries a node mount and PDF page without a metadata prelude', async () => {
  appData = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-attachment-prelude-'));
  initializeDatabaseConnection(openDatabaseConnection());
  const driver = openDatabaseConnection().driver;
  const id = 'a'.repeat(64);
  driver.execute(`INSERT INTO pdf_page_text (attachment_id, page, text) VALUES (?, 1, 'page text')`, [id]);
  driver.execute(`INSERT INTO nodes (id, kind, title, content, resource_references, created_at, updated_at)
    VALUES ('node-1', 'topic', 'Document', '', ?, 'now', 'now')`,
    [JSON.stringify([{ storage_key: `${id}.pdf`, role: 'reference', original_name: 'document.pdf' }])]);
  driver.execute(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at)
    VALUES ('pdf_page_text', ?, 1, 'page-hash', 'source', 'now'),
      ('node', 'node-1', 2, 'node-hash', 'source', 'now'),
      ('attachment', ?, 10, 'attachment-hash', 'source', 'now')`, [`${id}:1`, id]);

  const page = loadPackRows(0, 2, driver);
  expect(page.consumedStateSeq).toBe(2);
  expect(page.stateRows.map((row) => `${row.object_type}:${row.object_id}`))
    .toEqual([`pdf_page_text:${id}:1`, 'node:node-1']);
  expect(page.syncObjects.map((row) => `${row.object_type}:${row.object_id}`).sort())
    .toEqual([`pdf_page_text:${id}:1`]);
  driver.execute("UPDATE sync_object_state SET state_seq = 3 WHERE object_type = 'attachment'");
  driver.execute("UPDATE sync_object_state SET state_seq = 4 WHERE object_type = 'node'");
  expect(loadPackRows(3, 4, driver).stateRows.map((row) => row.object_type)).toEqual(['node']);
  expect(loadPackRows(3, 4, driver).nodes[0]?.resource_references).toContain(`${id}.pdf`);
});
