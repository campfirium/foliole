import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const BLOB_NODE_ID = 't175-blob-only';
const MISSING_NODE_ID = 't175-missing-blob';
const AUTHORITY_BODY = 'T175 Blob authority survives metadata changes and sync version flush.';

function openDatabase(databasePath: string) {
  const database = new DatabaseSync(databasePath);
  database.exec('PRAGMA busy_timeout = 5000');
  return database;
}

async function seedNodes(page: Parameters<typeof expectWorkspaceShell>[0]) {
  await page.evaluate(async ({ authorityBody, blobNodeId, missingNodeId }) => {
    await globalThis.window?.__folioleWorkspaceDebug?.seedNodes?.([
      { content: authorityBody, id: blobNodeId, kind: 'topic', title: 'T175 Blob authority' },
      { content: 'Unavailable authority', id: missingNodeId, kind: 'topic', title: 'T175 Missing Blob' }
    ]);
    await globalThis.window?.electronAPI?.invoke('flush_dirty_node_sync_versions');
  }, { authorityBody: AUTHORITY_BODY, blobNodeId: BLOB_NODE_ID, missingNodeId: MISSING_NODE_ID });
}

test('Blob-only bodies survive metadata flush and missing Blob bodies stay dirty', async ({
  desktopApp,
  desktopWindow
}) => {
  await expectWorkspaceShell(desktopWindow);
  await seedNodes(desktopWindow);
  const libraryHome = await desktopApp.evaluate(() => process.env.FOLIOLE_LIBRARY_HOME ?? null);
  if (!libraryHome) throw new Error('missing isolated library home');
  const databasePath = path.join(libraryHome, 'Data', 'foliole.db');

  const database = openDatabase(databasePath);
  const missingHash = database.prepare('SELECT body_blob_hash FROM nodes WHERE id = ?')
    .get(MISSING_NODE_ID) as { body_blob_hash: string };
  const missingVersionCount = database.prepare(
    'SELECT COUNT(*) AS count FROM node_sync_versions WHERE object_id = ?'
  ).get(MISSING_NODE_ID) as { count: number };
  database.prepare(
    `UPDATE nodes SET content = '', reveal = 'metadata-only', sync_dirty = 1 WHERE id = ?`
  ).run(BLOB_NODE_ID);
  database.prepare(
    `UPDATE nodes SET content = 'stale inline', reveal = 'must-not-flush', sync_dirty = 1 WHERE id = ?`
  ).run(MISSING_NODE_ID);
  database.prepare('DELETE FROM content_blob_data WHERE hash = ?').run(missingHash.body_blob_hash);
  database.close();

  const flushed = await desktopWindow.evaluate(async () => (
    globalThis.window?.electronAPI?.invoke('flush_dirty_node_sync_versions')
  ));
  expect(flushed).toContain(BLOB_NODE_ID);

  const verified = openDatabase(databasePath);
  const blobNode = verified.prepare(
    `SELECT n.content, n.sync_dirty, CAST(cbd.data AS TEXT) AS blob_body, v.body_text
     FROM nodes n
     LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
     LEFT JOIN node_sync_versions v ON v.version_id = n.current_version_id
     WHERE n.id = ?`
  ).get(BLOB_NODE_ID);
  const missingNode = verified.prepare(
    `SELECT n.sync_dirty,
            (SELECT COUNT(*) FROM node_sync_versions WHERE object_id = n.id) AS version_count
     FROM nodes n WHERE n.id = ?`
  ).get(MISSING_NODE_ID);
  verified.close();

  expect(blobNode).toMatchObject({
    blob_body: AUTHORITY_BODY,
    body_text: AUTHORITY_BODY,
    content: '',
    sync_dirty: 0
  });
  expect(missingNode).toEqual({ sync_dirty: 1, version_count: missingVersionCount.count });
  await expect(desktopWindow.evaluate(async ({ blobNodeId }) => (
    globalThis.window?.electronAPI?.invoke('load_node_document', { nodeId: blobNodeId })
  ), { blobNodeId: BLOB_NODE_ID })).resolves.toMatchObject({ content: AUTHORITY_BODY });
  await expect(desktopWindow.evaluate(async ({ missingNodeId }) => (
    globalThis.window?.electronAPI?.invoke('load_node_document', { nodeId: missingNodeId })
  ), { missingNodeId: MISSING_NODE_ID })).resolves.toBeNull();
});
