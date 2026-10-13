import { expect, test } from './harness/fixtures';
import { loadNodeDocument } from './harness/localDataFileAcceptance';
import { expectWorkspaceShell } from './harness/settings';

const BODY = 'Current version 正文\r\nAlready received.\n';
const NODE_ID = 't277-current-body';

test('reads an owned current body without a resource peer or shared cache after reload', async ({
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
  expect((await loadNodeDocument(page, NODE_ID))?.content).toBe(BODY);
  const after = await desktopApp.evaluate(async (_, id) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    return connection.runWithDatabaseConnectionOwner(() => {
      const db = connection.openDatabaseConnection().sqlite;
      return { cacheRows: db.prepare('SELECT COUNT(*) FROM content_blob_data WHERE hash=?').pluck().get(
        db.prepare('SELECT body_blob_hash FROM nodes WHERE id=?').pluck().get(id)),
        node: db.prepare('SELECT body_blob_hash, current_version_id FROM nodes WHERE id=?').get(id),
        state: db.prepare("SELECT * FROM sync_object_state WHERE object_type='node' AND object_id=?").get(id) };
    });
  }, NODE_ID);
  expect(after.node).toEqual(before.node);
  expect(after.state).toEqual(before.state);
  expect(after.cacheRows).toBe(0);
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
