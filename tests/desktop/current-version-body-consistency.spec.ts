import { expect, test } from './harness/fixtures';
import { loadNodeDocument } from './harness/localDataFileAcceptance';
import { expectWorkspaceShell } from './harness/settings';

const NODE_ID = 't279-body-consistency';
const BODY = 'Current article 正文.\nSecond paragraph.\n';
const NEXT = 'Updated article 正文.\nSecond paragraph.\n';

test('preserves article text while repairing its current version and publishes later body changes', async ({
  desktopApp, desktopWindow: page
}, testInfo) => {
  await expectWorkspaceShell(page);
  await page.evaluate(async ({ id, content }) => {
    await window.__folioleWorkspaceDebug?.seedNodes?.([
      { id, kind: 'topic', title: 'Version body consistency', content }
    ], { persist: true });
  }, { id: NODE_ID, content: BODY });
  await expect.poll(async () => (await loadNodeDocument(page, NODE_ID))?.content).toBe(BODY);
  const repaired = await desktopApp.evaluate(async (_, id) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    const repair = require(`${process.cwd()}/dist/electron/database/currentVersionBodyRepair.js`);
    return connection.runWithDatabaseConnectionOwner(() => {
      const { sqlite: db, driver } = connection.openDatabaseConnection();
      const node = db.prepare('SELECT body_blob_hash, current_version_id FROM nodes WHERE id = ?').get(id);
      db.prepare('UPDATE node_sync_versions SET body_text = ? WHERE version_id = ?').run('', node.current_version_id);
      const old = db.prepare('SELECT * FROM node_sync_versions WHERE version_id = ?').get(node.current_version_id);
      const input = { nodeId: id, expectedVersionId: node.current_version_id, expectedBodyBlobHash: node.body_blob_hash,
        hostName: 'native-test', now: new Date().toISOString() };
      const versionId = repair.repairCurrentVersionBodyWithDriver(driver, input);
      return { old, after: db.prepare('SELECT * FROM node_sync_versions WHERE version_id = ?').get(node.current_version_id),
        current: db.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').get(versionId),
        repeat: repair.repairCurrentVersionBodyWithDriver(driver, input), versionId };
    });
  }, NODE_ID);
  expect(repaired.after).toEqual(repaired.old);
  expect(repaired.current.body_text).toBe(BODY);
  expect(repaired.repeat).toBeNull();
  await expect.poll(async () => (await loadNodeDocument(page, NODE_ID))?.content).toBe(BODY);
  const changed = await desktopApp.evaluate(async (_, { id, content }) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    const writer = require(`${process.cwd()}/dist/lib/core/database/nodeBodyMutation.js`);
    const versions = require(`${process.cwd()}/dist/electron/database/nodeSyncVersionFromDriver.js`);
    return connection.runWithDatabaseConnectionOwner(() => {
      const { sqlite: db, driver } = connection.openDatabaseConnection();
      const now = new Date().toISOString();
      writer.writeNodeBody({ driver, nodeId: id, title: 'Version body consistency', content, updatedAt: now });
      const versionId = versions.flushNodeSyncVersionWithDriver(driver, id, 'native-test', now);
      return { versionId, current: db.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').get(versionId) };
    });
  }, { id: NODE_ID, content: NEXT });
  expect(changed.versionId).toBeTruthy();
  expect(changed.current.body_text).toBe(NEXT);
  await page.reload();
  await expectWorkspaceShell(page);
  await expect.poll(async () => (await loadNodeDocument(page, NODE_ID))?.content).toBe(NEXT);
  await page.evaluate((id) => window.__folioleWorkspaceDebug?.openNode?.(id), NODE_ID);
  await expect.poll(() => page.evaluate(() => window.__folioleDebug?.getEditorContent?.('prompt-editor'))).toBe(NEXT);
  await testInfo.attach('body-version-consistency', {
    body: JSON.stringify({ repaired, changed }, null, 2), contentType: 'application/json'
  });
});
