import { expect, test } from './harness/fixtures';
import { loadNodeDocument } from './harness/localDataFileAcceptance';
import { expectWorkspaceShell } from './harness/settings';

const BODY = 'Current version 正文\r\nAlready received.\n';
const NODE_ID = 't277-current-body';

test('restores an already received current body without a resource peer and preserves it after reload', async ({
  desktopApp, desktopWindow: page
}, testInfo) => {
  await expectWorkspaceShell(page);
  await page.evaluate(async ({ id, content }) => {
    await window.__folioleWorkspaceDebug?.seedNodes?.([
      { id, kind: 'topic', title: 'Current version body', content }
    ], { persist: true });
  }, { id: NODE_ID, content: BODY });
  await expect.poll(async () => (await loadNodeDocument(page, NODE_ID))?.content).toBe(BODY);
  const before = await desktopApp.evaluate(async (_, id) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    return connection.runWithDatabaseConnectionOwner(() => {
      const db = connection.openDatabaseConnection().sqlite;
      const node = db.prepare('SELECT body_blob_hash, current_version_id FROM nodes WHERE id=?').get(id);
      const state = db.prepare("SELECT * FROM sync_object_state WHERE object_type='node' AND object_id=?").get(id);
      db.prepare('DELETE FROM content_blob_data WHERE hash=?').run(node.body_blob_hash);
      db.prepare("UPDATE content_blobs SET availability='missing' WHERE hash=?").run(node.body_blob_hash);
      return { node, state };
    });
  }, NODE_ID);
  expect((await loadNodeDocument(page, NODE_ID))?.content).not.toBe(BODY);
  const after = await desktopApp.evaluate(async (_, id) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    const resources = require(`${process.cwd()}/dist/electron/sync/desktopSyncGroupResources.js`);
    const result = await resources.downloadDesktopSyncGroupResources({
      endpoint_url: 'http://127.0.0.1:1', group_id: 'unused', local_device_id: 'unused', peer_device_id: 'unused'
    });
    return connection.runWithDatabaseConnectionOwner(() => {
      const db = connection.openDatabaseConnection().sqlite;
      return { result,
        node: db.prepare('SELECT body_blob_hash, current_version_id FROM nodes WHERE id=?').get(id),
        state: db.prepare("SELECT * FROM sync_object_state WHERE object_type='node' AND object_id=?").get(id) };
    });
  }, NODE_ID);
  expect(after.node).toEqual(before.node);
  expect(after.state).toEqual(before.state);
  expect(after.result.remainingContentBlobCount).toBe(0);
  expect(after.result.resourceResults).toEqual([]);
  await expect.poll(async () => (await loadNodeDocument(page, NODE_ID))?.content).toBe(BODY);
  await page.reload();
  await expectWorkspaceShell(page);
  await expect.poll(async () => (await loadNodeDocument(page, NODE_ID))?.content).toBe(BODY);
  await page.evaluate((id) => window.__folioleWorkspaceDebug?.openNode?.(id), NODE_ID);
  await expect.poll(() => page.evaluate(() => window.__folioleDebug?.getEditorContent?.('prompt-editor')))
    .toBe(BODY.replaceAll('\r\n', '\n'));
  await testInfo.attach('current-body-blob-restored', {
    body: JSON.stringify({ before, after, content: BODY }, null, 2), contentType: 'application/json'
  });
});
